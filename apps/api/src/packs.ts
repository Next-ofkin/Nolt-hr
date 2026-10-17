import {
  BadRequestException, Body, ConflictException, Controller, Get, Inject,
  Injectable, NotFoundException, Param, ParseUUIDPipe, Post, Put, Req, UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Prisma } from "@prisma/client";
import { Database } from "./database.js";
import { HrGuard, SessionGuard, type AuthRequest } from "./auth.js";
import { packTemplateSchema, publishPackSchema, updatePackSchema } from "./pack-rules.js";

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
