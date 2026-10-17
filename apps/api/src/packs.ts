import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Inject,
  Injectable, NotFoundException, Param, ParseUUIDPipe, Post, Put, Req, UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Prisma } from "@prisma/client";
import { Database } from "./database.js";
import { HrGuard, SessionGuard, type AuthRequest } from "./auth.js";
import { assignPackSchema, packTemplateSchema, publishPackSchema, updatePackSchema } from "./pack-rules.js";

const packAssignmentInclude = {
  pack: { select: { name: true, employmentType: true } },
  forms: { orderBy: { position: "asc" as const },
    include: { formAssignment: { include: { formVersion: { select: { title: true } },
      response: { select: { status: true } } } } } },
} satisfies Prisma.PackAssignmentInclude;

@Injectable()
export class PacksService {
  constructor(@Inject(Database) private readonly db: Database) {}

  async list() {
    return this.db.packTemplate.findMany({
      take: 100, orderBy: { createdAt: "desc" },
      include: { items: { orderBy: { position: "asc" } } },
    });
  }

  async get(id: string) {
    const pack = await this.db.packTemplate.findUnique({
      where: { id }, include: { items: { orderBy: { position: "asc" } } },
    });
    if (!pack) throw new NotFoundException("Pack not found.");
    return pack;
  }


  private async lockAndVerifyVersions(
    tx: Prisma.TransactionClient,
    items: readonly { formId: string; formVersionId: string }[],
  ) {
    // Parent form locks match FormService publishing and unpublishing order.
    const formIds = [...new Set(items.map(item => item.formId))].sort();
    for (const id of formIds) {
      const found = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Form" WHERE id = ${id}::uuid FOR UPDATE`;
      if (!found.length) throw new ConflictException("A selected form no longer exists.");
    }
    const versionIds = [...new Set(items.map(item => item.formVersionId))].sort();
    for (const id of versionIds) {
      await tx.$queryRaw`SELECT id FROM "FormVersion" WHERE id = ${id}::uuid FOR SHARE`;
    }
    const versions = await tx.formVersion.findMany({
      where: { id: { in: versionIds } },
      select: { id: true, formId: true, status: true },
    });
    const byId = new Map(versions.map(version => [version.id, version]));
    for (const item of items) {
      const version = byId.get(item.formVersionId);
      if (!version || version.formId !== item.formId || version.status !== "PUBLISHED")
        throw new ConflictException("All pack items must reference published versions of the selected forms.");
    }
  }

  async update(actorId: string, id: string, input: unknown) {
    const parsed = updatePackSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException("Invalid pack changes or revision.");
    const { expectedRevision, ...content } = parsed.data;
    return this.db.$transaction(async tx => {
      // Optimistic lock prevents overwriting another HR user's edits.
      const updated = await tx.packTemplate.updateMany({
        where: { id, status: "DRAFT", revision: expectedRevision },
        data: {
          name: content.name, description: content.description,
          employmentType: content.employmentType,
          revision: { increment: 1 }, updatedAt: new Date(),
        },
      });
      if (updated.count !== 1)
        throw new ConflictException("This pack was changed or published. Reload before editing.");
      await this.lockAndVerifyVersions(tx, content.items);
      await tx.packItem.deleteMany({ where: { packId: id } });
      await tx.packItem.createMany({
        data: content.items.map(item => ({
          packId: id, formId: item.formId, formVersionId: item.formVersionId,
          required: item.required, position: item.order,
        })),
      });
      await tx.auditEvent.create({
        data: { actorId, action: "PACK_DRAFT_UPDATED", targetId: id,
          metadata: { revision: expectedRevision + 1, itemCount: content.items.length } },
      });
      await tx.outboxEvent.create({ data: { type: "PACK_DRAFT_UPDATED", targetId: id } });
      return tx.packTemplate.findUniqueOrThrow({
        where: { id }, include: { items: { orderBy: { position: "asc" } } },
      });
    });
  }

  async publish(actorId: string, id: string, input: unknown) {
    const parsed = publishPackSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException("Expected pack revision is required.");
    return this.db.$transaction(async tx => {
      // Lock the pack before checking its revision and content.
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "PackTemplate" WHERE id = ${id}::uuid FOR UPDATE`;
      if (!locked.length) throw new NotFoundException("Pack not found.");
      const pack = await tx.packTemplate.findUniqueOrThrow({
        where: { id }, include: { items: { orderBy: { position: "asc" } } },
      });
      if (pack.status !== "DRAFT" || pack.revision !== parsed.data.expectedRevision)
        throw new ConflictException("Pack changed or was already published. Reload it first.");
      if (!pack.items.length) throw new ConflictException("A pack must contain at least one form.");
      await this.lockAndVerifyVersions(tx, pack.items);
      const published = await tx.packTemplate.update({
        where: { id },
        data: { status: "PUBLISHED", publishedAt: new Date(),
          updatedAt: new Date(), revision: { increment: 1 } },
        include: { items: { orderBy: { position: "asc" } } },
      });
      await tx.auditEvent.create({
        data: { actorId, action: "PACK_PUBLISHED", targetId: id,
          metadata: { revision: published.revision, itemCount: published.items.length } },
      });
      await tx.outboxEvent.create({ data: { type: "PACK_PUBLISHED", targetId: id } });
      return published;
    });
  }


  async assign(actorId: string, packId: string, input: unknown) {
    const parsed = assignPackSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException("Select an active case, its revision and an optional valid due date.");
    const { caseId, expectedCaseRevision, dueDate } = parsed.data;
    try {
      return await this.db.$transaction(async tx => {
        // Serialize against form assignment, case closure and other pack assignments.
        const lockedCase = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM public."OnboardingCase" WHERE id=${caseId}::uuid FOR UPDATE`;
        if (!lockedCase.length) throw new NotFoundException("Onboarding case not found.");
        const activeCase = await tx.onboardingCase.findUnique({
          where: { id: caseId }, include: { employee: true },
        });
        if (!activeCase || activeCase.status !== "ACTIVE" || activeCase.revision !== expectedCaseRevision)
          throw new ConflictException("Onboarding case changed or closed. Reload before assigning.");
        const packRow = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM public."PackTemplate" WHERE id=${packId}::uuid FOR SHARE`;
        if (!packRow.length) throw new NotFoundException("Pack not found.");
        const pack = await tx.packTemplate.findUniqueOrThrow({
          where: { id: packId }, include: { items: { orderBy: { position: "asc" } } },
        });
        if (pack.status !== "PUBLISHED" || pack.items.length === 0)
          throw new ConflictException("Only published nonempty packs can be assigned.");
        if (pack.employmentType.trim().toLowerCase() !== activeCase.employee.employmentType.trim().toLowerCase())
          throw new BadRequestException("Pack employment type must match the employee.");
        if (await tx.packAssignment.findUnique({ where: { packId_caseId: { packId, caseId } } }))
          throw new ConflictException("This pack is already assigned to the case.");
        await this.lockAndVerifyVersions(tx, pack.items);
        const existing = await tx.formAssignment.findMany({
          where: { caseId, formId: { in: pack.items.map(item => item.formId) } },
          select: { formId: true },
        });
        if (existing.length) throw new ConflictException("One or more pack forms are already assigned to this case.");
        const assignment = await tx.packAssignment.create({
          data: { caseId, packId, assignedBy: actorId,
            dueDate: dueDate ? new Date(dueDate + "T00:00:00.000Z") : null },
        });
        for (const item of pack.items) {
          const form = await tx.formAssignment.create({
            data: { caseId, formId: item.formId, formVersionId: item.formVersionId,
              required: item.required, assignedBy: actorId,
              dueDate: dueDate ? new Date(dueDate + "T00:00:00.000Z") : null },
          });
          await tx.packAssignmentForm.create({
            data: { packAssignmentId: assignment.id, formAssignmentId: form.id, position: item.position },
          });
        }
        await tx.onboardingCase.update({ where: { id: caseId }, data: { revision: { increment: 1 } } });
        await tx.auditEvent.create({
          data: { actorId, action: "PACK_ASSIGNED", targetId: assignment.id,
            metadata: { caseId, packId, formCount: pack.items.length, dueDate } },
        });
        await tx.outboxEvent.create({ data: { type: "PACK_ASSIGNED", targetId: assignment.id } });
        return { id: assignment.id, caseId, packId, dueDate,
          assignedForms: pack.items.length, caseRevision: expectedCaseRevision + 1 };
      }, { timeout: 20000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new ConflictException("Pack or form was already assigned. Reload before retrying.");
      throw error;
    }
  }



  private progress(a: Prisma.PackAssignmentGetPayload<{ include: typeof packAssignmentInclude }>) {
    const forms = a.forms.map(link => ({
      assignmentId: link.formAssignmentId,
      title: link.formAssignment.formVersion.title,
      required: link.formAssignment.required,
      position: link.position,
      status: link.formAssignment.response?.status ?? "NOT_STARTED",
    }));
    const required = forms.filter(form => form.required);
    const approvedRequired = required.filter(form => form.status === "APPROVED").length;
    const submittedRequired = required.filter(form => form.status === "SUBMITTED").length;
    const ready = required.length > 0 && approvedRequired === required.length;
    return {
      id: a.id, packId: a.packId, packName: a.pack.name, caseId: a.caseId,
      dueDate: a.dueDate?.toISOString().slice(0, 10) ?? null,
      assignedAt: a.createdAt.toISOString(),
      approvedAt: a.approvedAt?.toISOString() ?? null,
      totalForms: forms.length,
      requiredForms: required.length, approvedRequired, submittedRequired,
      readyForApproval: ready && !a.approvedAt,
      status: a.approvedAt ? "APPROVED" : ready ? "READY_FOR_APPROVAL" :
        submittedRequired > 0 || approvedRequired > 0 ? "IN_PROGRESS" : "PENDING",
      forms,
    };
  }

  async caseAssignments(caseId: string) {
    const record = await this.db.onboardingCase.findUnique({ where: { id: caseId } });
    if (!record) throw new NotFoundException("Onboarding case not found.");
    const rows = await this.db.packAssignment.findMany({
      where: { caseId }, orderBy: { createdAt: "desc" },
      include: packAssignmentInclude,
    });
    return rows.map(row => this.progress(row));
  }

  async myAssignments(userId: string) {
    const rows = await this.db.packAssignment.findMany({
      where: { onboardingCase: { employee: { userId }, status: "ACTIVE" } },
      orderBy: { createdAt: "desc" }, include: packAssignmentInclude,
    });
    return rows.map(row => this.progress(row));
  }

  async approve(actorId: string, id: string) {
    return this.db.$transaction(async tx => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT c.id FROM public."OnboardingCase" c
        JOIN public."PackAssignment" pa ON pa."caseId"=c.id
        WHERE pa.id=${id}::uuid FOR UPDATE OF c`;
      if (!rows.length) throw new NotFoundException("Pack assignment not found.");
      const assignment = await tx.packAssignment.findUnique({
        where: { id }, include: packAssignmentInclude,
      });
      if (!assignment) throw new NotFoundException("Pack assignment not found.");
      const currentCase = await tx.onboardingCase.findUnique({ where: { id: assignment.caseId } });
      if (currentCase?.status !== "ACTIVE")
        throw new ConflictException("The onboarding case is no longer active.");
      if (assignment.approvedAt)
        throw new ConflictException("This pack has already been approved.");
      const progress = this.progress(assignment);
      if (!progress.readyForApproval)
        throw new ConflictException("Every required form must receive HR approval first.");
      await tx.packAssignment.update({
        where: { id }, data: { approvedAt: new Date(), approvedBy: actorId },
      });
      await tx.auditEvent.create({
        data: { actorId, action: "PACK_APPROVED", targetId: id,
          metadata: { caseId: assignment.caseId, approvedRequired: progress.approvedRequired } },
      });
      await tx.outboxEvent.create({ data: { type: "PACK_APPROVED", targetId: id } });
      return { approved: true, packAssignmentId: id };
    });
  }

  async create(actorId: string, input: unknown) {
    const parsed = packTemplateSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException({
      code: "INVALID_PACK", message: "Check the pack fields and form selection.",
      fields: parsed.error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })),
    });
    const content = parsed.data;
    return this.db.$transaction(async tx => {
      await this.lockAndVerifyVersions(tx, content.items);
      const pack = await tx.packTemplate.create({
        data: {
          name: content.name, description: content.description,
          employmentType: content.employmentType, createdBy: actorId,
          items: {
            create: content.items.map(item => ({
              formId: item.formId, formVersionId: item.formVersionId,
              position: item.order, required: item.required,
            })),
          },
        },
        include: { items: { orderBy: { position: "asc" } } },
      });
      await tx.auditEvent.create({
        data: { actorId, action: "PACK_DRAFT_CREATED", targetId: pack.id,
          metadata: { itemCount: pack.items.length } as Prisma.InputJsonValue },
      });
      await tx.outboxEvent.create({ data: { type: "PACK_DRAFT_CREATED", targetId: pack.id } });
      return pack;
    });
  }
}

@ApiTags("HR packs")
@ApiCookieAuth("session")
@UseGuards(SessionGuard, HrGuard)
@Controller("packs")
export class PacksController {
  constructor(@Inject(PacksService) private readonly packs: PacksService) {}
  @Get()
  @ApiOkResponse({ description: "List pack templates" })
  list() { return this.packs.list(); }
  @Get("cases/:caseId")
  @ApiOkResponse({ description: "HR overview of assigned packs and per-form progress" })
  caseAssignments(@Req() req: AuthRequest, @Param("caseId", ParseUUIDPipe) caseId: string) {
    if (!req.actor.permissions.includes("employees.manage"))
      throw new ForbiddenException("Employee management permission is required.");
    return this.packs.caseAssignments(caseId);
  }
  @Post(":id/assign")
  @ApiCreatedResponse({ description: "Assign an entire published pack to an active case" })
  assign(@Req() req: AuthRequest, @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown) {
    if (!req.actor.permissions.includes("employees.manage"))
      throw new ForbiddenException("Employee assignment permission is required.");
    return this.packs.assign(req.actor.id, id, body);
  }
  @Post("assignments/:id/approve")
  @ApiCreatedResponse({ description: "Approve a pack only after all required form reviews" })
  approve(@Req() req: AuthRequest, @Param("id", ParseUUIDPipe) id: string) {
    if (!req.actor.permissions.includes("employees.manage"))
      throw new ForbiddenException("Employee management permission is required.");
    return this.packs.approve(req.actor.id, id);
  }
  @Get(":id")
  @ApiOkResponse({ description: "Get a pack template" })
  get(@Param("id", ParseUUIDPipe) id: string) { return this.packs.get(id); }
  @Put(":id")
  @ApiOkResponse({ description: "Update a revision-checked draft pack" })
  update(@Req() req: AuthRequest, @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown) { return this.packs.update(req.actor.id, id, body); }

  @Post(":id/publish")
  @ApiCreatedResponse({ description: "Publish and lock a completed pack" })
  publish(@Req() req: AuthRequest, @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown) { return this.packs.publish(req.actor.id, id, body); }

  @Post()
  @ApiCreatedResponse({ description: "Create a draft pack from published forms" })
  @ApiBody({ schema: { type: "object", additionalProperties: true } })
  create(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.packs.create(req.actor.id, body);
  }
}

@ApiTags("Own onboarding packs")
@ApiCookieAuth("session")
@UseGuards(SessionGuard)
@Controller("me/packs")
export class MyPacksController {
  constructor(@Inject(PacksService) private readonly packs: PacksService) {}
  @Get()
  @ApiOkResponse({ description: "Own active-case pack progress without exposing other employees" })
  my(@Req() req: AuthRequest) {
    if (!req.actor.permissions.includes("profile.own"))
      throw new ForbiddenException("Employee account required.");
    return this.packs.myAssignments(req.actor.id);
  }
}
