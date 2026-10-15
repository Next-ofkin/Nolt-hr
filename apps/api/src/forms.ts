import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiProperty,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
} from "@nestjs/swagger";
import {
  createFormSchema,
  formContentSchema,
  publishContentSchema,
  revisionSchema,
  saveFormSchema,
  type FormContent,
} from "@nolt/form-schemas";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { SchemaObject } from "@nestjs/swagger";
function openapi(schema: z.ZodType): SchemaObject {
  return z.toJSONSchema(schema, {
    target: "openapi-3.0",
  }) as unknown as SchemaObject;
}
import { Database } from "./database.js";
import { HrGuard, SessionGuard, type AuthRequest } from "./auth.js";

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success)
    throw new BadRequestException({
      message: result.error.issues.map((x) => x.message).join(" "),
      code: "VALIDATION_FAILED",
      fields: result.error.issues.map((x) => ({
        path: x.path.join("."),
        message: x.message,
      })),
    });
  return result.data;
}
const bodySchema = { type: "object", additionalProperties: true } as const;
export class FormDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) formId!: string;
  @ApiProperty({ type: String }) title!: string;
  @ApiProperty({ type: String }) description!: string;
  @ApiProperty({ enum: ["EMPLOYEE", "GUARANTOR", "REFERENCE"] })
  recipient!: string;
  @ApiProperty({ enum: ["DRAFT", "PUBLISHED", "UNPUBLISHED"] }) status!: string;
  @ApiProperty({ type: Number }) version!: number;
  @ApiProperty({ type: Number }) revision!: number;
  @ApiProperty({
    type: "array",
    items: { type: "object", additionalProperties: true },
  })
  fields!: unknown[];
  @ApiProperty({ type: String }) updatedAt!: string;
  @ApiProperty({ nullable: true, type: String }) publishedAt!: string | null;
}
export function dto(row: {
  id: string;
  formId: string;
  title: string;
  description: string;
  recipient: string;
  status: string;
  version: number;
  revision: number;
  fields: Prisma.JsonValue;
  updatedAt: Date;
  publishedAt: Date | null;
}): FormDto {
  return {
    ...row,
    fields: row.fields as unknown[],
    updatedAt: row.updatedAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}
@Injectable()
export class FormsService {
  constructor(@Inject(Database) private readonly db: Database) {}
  async list() {
    const forms = await this.db.form.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    return forms.flatMap((f) => f.versions.map(dto));
  }
  async get(id: string) {
    const row = await this.db.formVersion.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Form version not found.");
    return dto(row);
  }
  async record(
    tx: Prisma.TransactionClient,
    actorId: string,
    action: string,
    targetId: string,
    metadata: Prisma.InputJsonValue = {},
  ) {
    await tx.auditEvent.create({
      data: { actorId, action, targetId, metadata },
    });
    await tx.outboxEvent.create({ data: { type: action, targetId } });
  }
  async create(actorId: string, input: unknown) {
    const data = parse(createFormSchema, input);
    return this.db.$transaction(async (tx) => {
      const form = await tx.form.create({ data: { createdBy: actorId } });
      const row = await tx.formVersion.create({
        data: {
          formId: form.id,
          version: 1,
          title: data.title,
          recipient: data.recipient,
        },
      });
      await this.record(tx, actorId, "FORM_CREATED", row.id, { version: 1 });
      return dto(row);
    });
  }
  async save(actorId: string, id: string, input: unknown) {
    const { expectedRevision, content } = parse(saveFormSchema, input);
    return this.db.$transaction(async (tx) => {
      const updated = await tx.formVersion.updateMany({
        where: { id, revision: expectedRevision, status: "DRAFT" },
        data: {
          ...content,
          fields: content.fields as Prisma.InputJsonValue,
          revision: { increment: 1 },
        },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          "This version changed or is published. Reload before editing.",
        );
      const row = await tx.formVersion.findUniqueOrThrow({ where: { id } });
      await this.record(tx, actorId, "FORM_DRAFT_SAVED", id, {
        revision: row.revision,
      });
      return dto(row);
    });
  }
  async publish(actorId: string, id: string, input: unknown) {
    const { expectedRevision } = parse(revisionSchema, input);
    return this.db.$transaction(async (tx) => {
      const row = await tx.formVersion.findUnique({ where: { id } });
      if (!row) throw new NotFoundException();
      parse(publishContentSchema, {
        title: row.title,
        description: row.description,
        recipient: row.recipient,
        fields: row.fields,
      });
      const updated = await tx.formVersion.updateMany({
        where: { id, revision: expectedRevision, status: "DRAFT" },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          revision: { increment: 1 },
        },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          "This version changed or is already published.",
        );
      await this.record(tx, actorId, "FORM_PUBLISHED", id, {
        version: row.version,
      });
      return dto(await tx.formVersion.findUniqueOrThrow({ where: { id } }));
    });
  }
  async unpublish(actorId: string, id: string, input: unknown) {
    const { expectedRevision } = parse(revisionSchema, input);
    return this.db.$transaction(async (tx) => {
      const row = await tx.formVersion.findUnique({ where: { id } });
      if (!row) throw new NotFoundException("Form version not found.");
      const updated = await tx.formVersion.updateMany({
        where: { id, revision: expectedRevision, status: "PUBLISHED" },
        data: { status: "UNPUBLISHED", revision: { increment: 1 } },
      });
      if (updated.count !== 1)
        throw new ConflictException("This form has changed or is no longer published.");
      await this.record(tx, actorId, "FORM_UNPUBLISHED", id, { version: row.version });
      return dto(await tx.formVersion.findUniqueOrThrow({ where: { id } }));
    });
  }
  async deleteDraft(actorId: string, formId: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Form" WHERE id = ${formId}::uuid FOR UPDATE`;
      const form = await tx.form.findUnique({ where: { id: formId }, include: { versions: true } });
      if (!form) throw new NotFoundException("Form not found.");
      if (form.versions.length !== 1 || form.versions[0].status !== "DRAFT")
        throw new ConflictException("Only a never-published draft can be deleted.");
      const assignments = await tx.formAssignment.count({ where: { formId } });
      if (assignments)
        throw new ConflictException("This form has assignments and cannot be deleted.");
      await tx.formVersion.delete({ where: { id: form.versions[0].id } });
      await tx.form.delete({ where: { id: formId } });
      await this.record(tx, actorId, "FORM_DRAFT_DELETED", formId, { title: form.versions[0].title });
      return { deleted: true };
    });
  }
  async newVersion(actorId: string, formId: string) {
    return this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM "Form" WHERE id = ${formId}::uuid FOR UPDATE`;
      if (!locked.length) throw new NotFoundException();
      const latest = await tx.formVersion.findFirstOrThrow({
        where: { formId },
        orderBy: { version: "desc" },
      });
      if (latest.status === "DRAFT") return dto(latest);
      const content = parse(formContentSchema, {
        title: latest.title,
        description: latest.description,
        recipient: latest.recipient,
        fields: latest.fields,
      });
      const row = await tx.formVersion.create({
        data: {
          ...content,
          fields: content.fields as Prisma.InputJsonValue,
          formId,
          version: latest.version + 1,
        },
      });
      await this.record(tx, actorId, "FORM_VERSION_CREATED", row.id, {
        version: row.version,
      });
      return dto(row);
    });
  }
}
@ApiTags("HR forms")
@ApiCookieAuth("session")
@ApiHeader({
  name: "x-csrf-token",
  required: false,
  description:
    "Required for mutations; obtained from the authenticated session",
})
@UseGuards(SessionGuard, HrGuard)
@Controller()
export class FormsController {
  constructor(@Inject(FormsService) private readonly service: FormsService) {}
  @Get("forms")
  @ApiOkResponse({ type: FormDto, isArray: true })
  list(): Promise<FormDto[]> {
    return this.service.list();
  }
  @Post("forms")
  @ApiCreatedResponse({ type: FormDto })
  @ApiBody({ schema: openapi(createFormSchema) })
  create(@Req() req: AuthRequest, @Body() body: unknown): Promise<FormDto> {
    return this.service.create(req.actor.id, body);
  }
  @Get("form-versions/:id") @ApiOkResponse({ type: FormDto }) get(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<FormDto> {
    return this.service.get(id);
  }
  @Put("form-versions/:id")
  @ApiOkResponse({ type: FormDto })
  @ApiBody({ schema: openapi(saveFormSchema) })
  save(
    @Req() req: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<FormDto> {
    return this.service.save(req.actor.id, id, body);
  }
  @Post("form-versions/:id/publish")
  @ApiCreatedResponse({ type: FormDto })
  @ApiBody({ schema: openapi(revisionSchema) })
  publish(
    @Req() req: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<FormDto> {
    return this.service.publish(req.actor.id, id, body);
  }
  @Post("form-versions/:id/unpublish")
  @ApiOkResponse({ type: FormDto })
  @ApiBody({ schema: openapi(revisionSchema) })
  unpublish(
    @Req() req: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<FormDto> {
    return this.service.unpublish(req.actor.id, id, body);
  }
  @Delete("forms/:id/draft")
  deleteDraft(
    @Req() req: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<{ deleted: boolean }> {
    return this.service.deleteDraft(req.actor.id, id);
  }
  @Post("forms/:id/versions") @ApiCreatedResponse({ type: FormDto }) newVersion(
    @Req() req: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<FormDto> {
    return this.service.newVersion(req.actor.id, id);
  }
}
