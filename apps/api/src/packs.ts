import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Inject,
  Injectable, NotFoundException, Param, ParseUUIDPipe, Post, Put, Req, UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Prisma } from "@prisma/client";
import { Database } from "./database.js";
import { HrGuard, SessionGuard, type AuthRequest } from "./auth.js";
import { assignPackSchema, packTemplateSchema, publishPackSchema, updatePackSchema } from "./pack-rules.js";

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

  async caseAssignments(caseId: string) {
    const caseRecord = await this.db.onboardingCase.findUnique({ where: { id: caseId } });
    if (!caseRecord) throw new NotFoundException("Onboarding case not found.");
    const assignments = await this.db.packAssignment.findMany({
      where: { caseId }, orderBy: { createdAt: "desc" },
      include: { pack: { select: { name: true, employmentType: true } },
        forms: { orderBy: { position: "asc" },
          include: { formAssignment: { include: { formVersion: { select: { title: true } },
            response: { select: { status: true } } } } } } },
    });
    return assignments.map(a => ({
      id: a.id, packId: a.packId, packName: a.pack.name, caseId: a.caseId,
      dueDate: a.dueDate?.toISOString().slice(0, 10) ?? null,
      assignedAt: a.createdAt.toISOString(), totalForms: a.forms.length,
      forms: a.forms.map(link => ({
        assignmentId: link.formAssignmentId, title: link.formAssignment.formVersion.title,
        required: link.formAssignment.required, position: link.position,
        status: link.formAssignment.response?.status ?? "NOT_STARTED",
      })),
    }));
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
