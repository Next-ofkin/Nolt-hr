import {
  BadRequestException, Body, ConflictException, Controller, Get, Inject,
  Injectable, NotFoundException, Param, ParseUUIDPipe, Post, Req, UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Prisma } from "@prisma/client";
import { Database } from "./database.js";
import { HrGuard, SessionGuard, type AuthRequest } from "./auth.js";
import { packTemplateSchema } from "./pack-rules.js";

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

  async create(actorId: string, input: unknown) {
    const parsed = packTemplateSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException({
      code: "INVALID_PACK", message: "Check the pack fields and form selection.",
      fields: parsed.error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })),
    });
    const content = parsed.data;
    return this.db.$transaction(async tx => {
      // Lock selected parent forms and exact versions in deterministic order,
      // preventing concurrent publish/withdraw from changing their state
      // while this pack is created.
      const formIds = [...new Set(content.items.map(item => item.formId))].sort();
      for (const id of formIds) {
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Form" WHERE id = ${id}::uuid FOR UPDATE`;
        if (!locked.length) throw new BadRequestException("A selected form does not exist.");
      }
      const versionIds = [...new Set(content.items.map(item => item.formVersionId))].sort();
      for (const id of versionIds) {
        await tx.$queryRaw`SELECT id FROM "FormVersion" WHERE id = ${id}::uuid FOR SHARE`;
      }
      const versions = await tx.formVersion.findMany({
        where: { id: { in: content.items.map(item => item.formVersionId) } },
        select: { id: true, formId: true, status: true },
      });
      const selected = new Map(versions.map(version => [version.id, version]));
      for (const item of content.items) {
        const version = selected.get(item.formVersionId);
        if (!version || version.formId !== item.formId || version.status !== "PUBLISHED") {
          throw new ConflictException("All pack items must reference a published version of the selected form.");
        }
      }
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
  @Post()
  @ApiCreatedResponse({ description: "Create a draft pack from published forms" })
  @ApiBody({ schema: { type: "object", additionalProperties: true } })
  create(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.packs.create(req.actor.id, body);
  }
}
