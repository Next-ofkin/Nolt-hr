import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Inject,
  Delete, Injectable, NotFoundException, Param, ParseUUIDPipe, Post, Put, Req, UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Prisma } from "@prisma/client";
import { Database } from "./database.js";
import { HrGuard, SessionGuard, type AuthRequest } from "./auth.js";
import { assignPackSchema, extendPackDeadlineSchema, isPackOverdue, packTemplateSchema, publishPackSchema, updatePackSchema } from "./pack-rules.js";

const packAssignmentInclude = {
  pack: { select: { name: true, employmentType: true } },
  forms: { orderBy: { position: "asc" as const },
    include: { formAssignment: { include: { formVersion: { select: { title: true } },
      response: { select: { status: true } },
      externalRequests: { orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }], select: { state: true, evidenceReview: { select: { decision: true } } }, take: 1 } } } } },
} satisfies Prisma.PackAssignmentInclude;

@Injectable()
export class PacksService {
  constructor(@Inject(Database) private readonly db: Database) {}

  /** Packs plus how many employees were given each one (a given pack is locked for good). */
  private withUse<T extends { _count: { assignments: number }; laterVersions: { id: string }[] }>(pack: T) {
    const { _count, laterVersions, ...rest } = pack;
    return { ...rest, assignmentCount: _count.assignments, hasLaterVersion: laterVersions.length > 0 };
  }
  private readonly useInclude = {
    items: { orderBy: { position: "asc" as const } },
    _count: { select: { assignments: true } },
    laterVersions: { select: { id: true }, take: 1 },
  };

  async list() {
    const packs = await this.db.packTemplate.findMany({
      take: 100, orderBy: { createdAt: "desc" }, include: this.useInclude,
    });
    return packs.map(p => this.withUse(p));
  }

  async get(id: string) {
    const pack = await this.db.packTemplate.findUnique({ where: { id }, include: this.useInclude });
    if (!pack) throw new NotFoundException("Pack not found.");
    return this.withUse(pack);
  }

  /** Stop offering a published pack. Employees who already have it keep it. */
  async unpublish(actorId: string, id: string) {
    return this.db.$transaction(async tx => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "PackTemplate" WHERE id = ${id}::uuid FOR UPDATE`;
      if (!locked.length) throw new NotFoundException("Pack not found.");
      const updated = await tx.packTemplate.updateMany({
        where: { id, status: "PUBLISHED" },
        data: { status: "WITHDRAWN", updatedAt: new Date() },
      });
      if (updated.count !== 1) throw new ConflictException("This pack is not published.");
      await tx.auditEvent.create({ data: { actorId, action: "PACK_UNPUBLISHED", targetId: id } });
      await tx.outboxEvent.create({ data: { type: "PACK_UNPUBLISHED", targetId: id } });
      return tx.packTemplate.findUniqueOrThrow({ where: { id }, include: this.useInclude }).then(p => this.withUse(p));
    });
  }

  /** Put a never-assigned pack with no newer version back to an editable draft. */
  private async toDraft(tx: Prisma.TransactionClient, id: string) {
    const pack = await tx.packTemplate.findUnique({ where: { id }, include: this.useInclude });
    if (!pack) throw new NotFoundException("Pack not found.");
    if (pack._count.assignments > 0)
      throw new ConflictException("This pack has already been given to an employee, so it stays as it is. Create a new version to make changes.");
    if (pack.laterVersions.length > 0)
      throw new ConflictException("A newer version of this pack exists. Use that one instead.");
    if (pack.status === "DRAFT") return pack;
    const updated = await tx.packTemplate.updateMany({
      where: { id, status: pack.status },
      data: { status: "DRAFT", publishedAt: null, revision: { increment: 1 }, updatedAt: new Date() },
    });
    if (updated.count !== 1) throw new ConflictException("This pack changed. Reload it.");
    return tx.packTemplate.findUniqueOrThrow({ where: { id }, include: this.useInclude });
  }

  async reopen(actorId: string, id: string) {
    return this.db.$transaction(async tx => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "PackTemplate" WHERE id = ${id}::uuid FOR UPDATE`;
      if (!locked.length) throw new NotFoundException("Pack not found.");
      const before = await tx.packTemplate.findUniqueOrThrow({ where: { id }, select: { status: true } });
      if (before.status === "PUBLISHED")
        throw new ConflictException("Unpublish this pack before editing it.");
      const pack = await this.toDraft(tx, id);
      await tx.auditEvent.create({ data: { actorId, action: "PACK_REOPENED", targetId: id } });
      await tx.outboxEvent.create({ data: { type: "PACK_REOPENED", targetId: id } });
      return this.withUse(pack);
    });
  }

  /** Delete a pack that was never given to anyone. */
  async remove(actorId: string, id: string) {
    return this.db.$transaction(async tx => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "PackTemplate" WHERE id = ${id}::uuid FOR UPDATE`;
      if (!locked.length) throw new NotFoundException("Pack not found.");
      const pack = await this.toDraft(tx, id);
      await tx.packItem.deleteMany({ where: { packId: id } });
      await tx.packTemplate.delete({ where: { id } });
      await tx.auditEvent.create({ data: { actorId, action: "PACK_DELETED", targetId: id, metadata: { name: pack.name, versionNumber: pack.versionNumber } } });
      await tx.outboxEvent.create({ data: { type: "PACK_DELETED", targetId: id } });
      return { deleted: true };
    });
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

  async newVersion(actorId: string, packId: string) {
    try {
      return await this.db.$transaction(async tx => {
        const selected = await tx.packTemplate.findUnique({ where: { id: packId },
          select: { id: true, rootPackId: true, status: true } });
        if (!selected) throw new NotFoundException("Pack not found.");
        if (selected.status !== "PUBLISHED")
          throw new ConflictException("Only published packs can be used as a new version source.");
        const rootId = selected.rootPackId ?? selected.id;
        // Serialise version-number allocation and concurrent version requests.
        await tx.$queryRaw`SELECT id FROM public."PackTemplate" WHERE id=${rootId}::uuid FOR UPDATE`;
        const existing = await tx.packTemplate.findFirst({
          where: { rootPackId: rootId, status: "DRAFT" },
          include: { items: { orderBy: { position: "asc" } } },
        });
        if (existing) return existing;
        const latest = await tx.packTemplate.findFirst({
          where: { OR: [{ id: rootId }, { rootPackId: rootId }] },
          orderBy: { versionNumber: "desc" },
        });
        if (!latest) throw new NotFoundException("Pack family not found.");
        const source = await tx.packTemplate.findUniqueOrThrow({
          where: { id: packId }, include: { items: { orderBy: { position: "asc" } } },
        });
        const copy = await tx.packTemplate.create({
          data: {
            rootPackId: rootId, versionNumber: latest.versionNumber + 1,
            name: source.name, description: source.description,
            employmentType: source.employmentType, createdBy: actorId,
            items: { create: source.items.map(item => ({
              formId: item.formId, formVersionId: item.formVersionId,
              required: item.required, position: item.position,
            })) },
          }, include: { items: { orderBy: { position: "asc" } } },
        });
        await tx.auditEvent.create({
          data: { actorId, action: "PACK_VERSION_DRAFT_CREATED", targetId: copy.id,
            metadata: { sourcePackId: packId, rootPackId: rootId, versionNumber: copy.versionNumber } },
        });
        await tx.outboxEvent.create({
          data: { type: "PACK_VERSION_DRAFT_CREATED", targetId: copy.id },
        });
        return copy;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new ConflictException("Another Pack version was started. Refresh and reopen its draft.");
      throw error;
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
    const { caseId, expectedCaseRevision, dueDate, confirmEmploymentTypeMismatch } = parsed.data;
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
        // A pack family can have older published versions assigned historically,
        // but new assignments must use its latest published version.
        const rootId = pack.rootPackId ?? pack.id;
        await tx.$queryRaw`SELECT id FROM public."PackTemplate" WHERE id=${rootId}::uuid FOR SHARE`;
        const newestPublished = await tx.packTemplate.findFirst({
          where: { status: "PUBLISHED", OR: [{ id: rootId }, { rootPackId: rootId }] },
          orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
          select: { id: true },
        });
        if (!newestPublished || newestPublished.id !== pack.id)
          throw new ConflictException("A newer published version exists. Select the latest Pack version.");
        if (pack.employmentType.trim().toLowerCase() !== activeCase.employee.employmentType.trim().toLowerCase() && !confirmEmploymentTypeMismatch)
          throw new BadRequestException("This pack is for a different employment type. Confirm the mismatch to assign it.");
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
            metadata: { caseId, packId, formCount: pack.items.length, dueDate, employmentTypeMismatch: pack.employmentType.trim().toLowerCase() !== activeCase.employee.employmentType.trim().toLowerCase() } },
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
      status: link.formAssignment.externalRequests[0]?.evidenceReview?.decision === "APPROVED" ? "APPROVED"
        : link.formAssignment.externalRequests[0]?.evidenceReview?.decision === "CHANGES_REQUIRED" ? "CHANGES_REQUIRED"
        : link.formAssignment.externalRequests[0]?.state === "SUBMITTED" ? "EXTERNAL_SUBMITTED"
        : link.formAssignment.response?.status ?? "NOT_STARTED",
    }));
    const required = forms.filter(form => form.required);
    const approvedRequired = required.filter(form => form.status === "APPROVED").length;
    const submittedRequired = required.filter(form => form.status === "SUBMITTED").length;
    const ready = required.length > 0 && approvedRequired === required.length;
    const today = new Date().toISOString().slice(0, 10);
    return {
      overdue: isPackOverdue(a.dueDate?.toISOString().slice(0, 10) ?? null, today, Boolean(a.approvedAt)),
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

  async extendDeadline(actorId: string, id: string, input: unknown) {
    const parsed = extendPackDeadlineSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException("Choose a valid date and provide a reason of at least 10 characters.");
    const { newDueDate, reason } = parsed.data;
    const today = new Date().toISOString().slice(0, 10);
    if (newDueDate <= today) throw new BadRequestException("Choose a future deadline.");
    return this.db.$transaction(async tx => {
      // Case lock serializes assignment and submission while changing due dates.
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT c.id FROM public."OnboardingCase" c
        JOIN public."PackAssignment" p ON p."caseId"=c.id
        WHERE p.id=${id}::uuid FOR UPDATE OF c`;
      if (!rows.length) throw new NotFoundException("Pack assignment not found.");
      const assignment = await tx.packAssignment.findUnique({
        where: { id }, include: { forms: { select: { formAssignmentId: true } },
          onboardingCase: { select: { status: true } } },
      });
      if (!assignment || assignment.onboardingCase.status !== "ACTIVE" || assignment.approvedAt)
        throw new ConflictException("Only active, unapproved Pack deadlines may be extended.");
      const previous = assignment.dueDate?.toISOString().slice(0, 10) ?? null;
      if (previous && newDueDate <= previous)
        throw new ConflictException("An extension must be later than the existing deadline.");
      const next = new Date(newDueDate + "T00:00:00.000Z");
      await tx.packAssignment.update({ where: { id }, data: { dueDate: next } });
      await tx.formAssignment.updateMany({
        where: { id: { in: assignment.forms.map(link => link.formAssignmentId) } },
        data: { dueDate: next },
      });
      await tx.packDeadlineChange.create({ data: {
        packAssignmentId: id, changedBy: actorId,
        previousDueDate: assignment.dueDate, newDueDate: next, reason,
      } });
      await tx.auditEvent.create({ data: { actorId, action: "PACK_DEADLINE_EXTENDED",
        targetId: id, metadata: { previousDueDate: previous, newDueDate, reason } } });
      await tx.outboxEvent.create({ data: { type: "PACK_DEADLINE_EXTENDED", targetId: id } });
      return { packAssignmentId: id, dueDate: newDueDate, extended: true };
    });
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
  @Post("assignments/:id/extend-deadline")
  @ApiCreatedResponse({ description: "Extend an unapproved pack deadline with an audit reason" })
  extendDeadline(@Req() req: AuthRequest, @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown) {
    if (!req.actor.permissions.includes("employees.manage"))
      throw new ForbiddenException("Employee management permission is required.");
    return this.packs.extendDeadline(req.actor.id, id, body);
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

  @Post(":id/versions")
  @ApiCreatedResponse({ description: "Create a new draft version without altering assigned published packs" })
  newVersion(@Req() req: AuthRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.packs.newVersion(req.actor.id, id);
  }

  @Post(":id/unpublish")
  @ApiCreatedResponse({ description: "Stop offering a published pack; employees who have it keep it" })
  unpublish(@Req() req: AuthRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.packs.unpublish(req.actor.id, id);
  }

  @Post(":id/reopen")
  @ApiCreatedResponse({ description: "Return an unpublished, never-assigned pack to an editable draft" })
  reopen(@Req() req: AuthRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.packs.reopen(req.actor.id, id);
  }

  @Delete(":id")
  @ApiOkResponse({ description: "Delete a pack that has never been given to an employee" })
  remove(@Req() req: AuthRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.packs.remove(req.actor.id, id);
  }

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
