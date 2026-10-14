import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
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
  ApiConflictResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiProperty,
  ApiTags,
  type SchemaObject,
} from "@nestjs/swagger";
import { Prisma } from "@prisma/client";
import {
  formContentSchema,
  saveResponseSchema,
  submitResponseSchema,
  validateAnswers,
} from "@nolt/form-schemas";
import { z } from "zod";
import { Database } from "./database.js";
import { AuthErrorDto, SessionGuard, type AuthRequest } from "./auth.js";
import { dto, FormDto } from "./forms.js";
export class SubmissionDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: Number }) version!: number;
  @ApiProperty({ type: String }) formVersionId!: string;
  @ApiProperty({ type: String }) submittedAt!: string;
  @ApiProperty({ type: String }) submittedBy!: string;
  @ApiProperty({
    type: "object",
    additionalProperties: {
      oneOf: [{ type: "string" }, { type: "boolean" }],
      nullable: true,
    },
  })
  answers!: Record<string, string | boolean | null>;
}
export class ResponseDto {
  @ApiProperty({ type: String }) assignmentId!: string;
  @ApiProperty({ type: FormDto }) form!: FormDto;
  @ApiProperty({ type: Number }) revision!: number;
  @ApiProperty({ enum: ["NOT_STARTED", "DRAFT", "SUBMITTED"] }) status!: string;
  @ApiProperty({ type: String, nullable: true }) updatedAt!: string | null;
  @ApiProperty({
    type: "object",
    additionalProperties: {
      oneOf: [{ type: "string" }, { type: "boolean" }],
      nullable: true,
    },
  })
  answers!: Record<string, string | boolean | null>;
  @ApiProperty({ type: [SubmissionDto] }) submissions!: SubmissionDto[];
}
export class ResponseFieldErrorDto {
  @ApiProperty({ type: String }) fieldId!: string;
  @ApiProperty({ type: String }) message!: string;
}
export class ResponseValidationErrorDto extends AuthErrorDto {
  @ApiProperty({ type: [ResponseFieldErrorDto], required: false })
  fields?: ResponseFieldErrorDto[];
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success)
    throw new BadRequestException(
      "Invalid response request. Check the answer types, size and revision.",
    );
  return r.data;
}
const include = {
  formVersion: true,
  onboardingCase: { include: { employee: true } },
} satisfies Prisma.FormAssignmentInclude;
@Injectable()
export class ResponsesService {
  constructor(@Inject(Database) private db: Database) {}
  private async assignment(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
    lock = false,
  ) {
    if (lock)
      await tx.$queryRaw`SELECT c.id FROM public."OnboardingCase" c JOIN public."FormAssignment" a ON a."caseId"=c.id JOIN public."Employee" e ON e.id=c."employeeId" WHERE a.id=${id}::uuid AND e."userId"=${userId}::uuid FOR UPDATE OF c`;
    const a = await tx.formAssignment.findFirst({
      where: { id, onboardingCase: { employee: { userId } } },
      include,
    });
    if (!a) throw new NotFoundException("Assigned form not found.");
    if (a.formVersion.recipient !== "EMPLOYEE")
      throw new ForbiddenException(
        "Only the designated guarantor or reference may answer this form.",
      );
    if (a.onboardingCase.status !== "ACTIVE")
      throw new ConflictException("This onboarding case is closed.");
    return a;
  }
  private async result(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
  ): Promise<ResponseDto> {
    const a = await this.assignment(tx, userId, id);
    const response = await tx.employeeResponse.findUnique({
      where: { assignmentId: id },
    });
    const submissions = await tx.formSubmission.findMany({
      where: { assignmentId: id },
      orderBy: { version: "desc" },
    });
    return {
      assignmentId: id,
      form: dto(a.formVersion),
      revision: response?.revision ?? 0,
      status: response?.status ?? "NOT_STARTED",
      updatedAt: response?.updatedAt.toISOString() ?? null,
      answers: (response?.answers ?? {}) as ResponseDto["answers"],
      submissions: submissions.map((s) => ({
        id: s.id,
        version: s.version,
        formVersionId: s.formVersionId,
        submittedBy: s.submittedBy,
        answers: s.answers as SubmissionDto["answers"],
        submittedAt: s.submittedAt.toISOString(),
      })),
    };
  }
  private async transaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.db.$transaction(work, { timeout: 15000, maxWait: 10000 });
  }
  async get(userId: string, id: string) {
    return this.db.$transaction((tx) => this.result(tx, userId, id), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 15000,
      maxWait: 10000,
    });
  }
  async save(userId: string, id: string, input: unknown) {
    const p = parse(saveResponseSchema, input);
    return this.transaction(async (tx) => {
      const a = await this.assignment(tx, userId, id, true);
      const current = await tx.employeeResponse.findUnique({
        where: { assignmentId: id },
      });
      if (
        current?.status === "SUBMITTED" ||
        (current?.revision ?? 0) !== p.expectedRevision
      )
        throw new ConflictException(
          "This response changed or was submitted. Reload before saving.",
        );
      const fields = formContentSchema.parse(a.formVersion).fields;
      const { answers, issues } = validateAnswers(fields, p.answers, false);
      if (issues.length)
        throw new BadRequestException({
          message: "Check the highlighted questions.",
          fields: issues,
        });
      await tx.employeeResponse.upsert({
        where: { assignmentId: id },
        create: { assignmentId: id, answers, updatedBy: userId },
        update: { answers, revision: { increment: 1 }, updatedBy: userId },
      });
      await this.audit(tx, userId, "RESPONSE_DRAFT_SAVED", id, {
        revision: p.expectedRevision + 1,
        formVersionId: a.formVersionId,
      });
      return this.result(tx, userId, id);
    });
  }
  async submit(userId: string, id: string, input: unknown) {
    const p = parse(submitResponseSchema, input);
    return this.transaction(async (tx) => {
      const a = await this.assignment(tx, userId, id, true);
      const replay = await tx.formSubmission.findUnique({
        where: {
          assignmentId_requestKey: {
            assignmentId: id,
            requestKey: p.requestKey,
          },
        },
      });
      if (replay) {
        if (
          replay.sourceRevision !== p.expectedRevision ||
          replay.submittedBy !== userId
        )
          throw new ConflictException(
            "This request key was already used for a different submission.",
          );
        return this.result(tx, userId, id);
      }
      const current = await tx.employeeResponse.findUnique({
        where: { assignmentId: id },
      });
      if (
        current?.status === "SUBMITTED" ||
        (current?.revision ?? 0) !== p.expectedRevision
      )
        throw new ConflictException(
          "This response changed or was submitted. Reload before submitting.",
        );
      const { answers, issues } = validateAnswers(
        formContentSchema.parse(a.formVersion).fields,
        current?.answers ?? {},
        true,
      );
      if (issues.length)
        throw new BadRequestException({
          message: "Complete the highlighted questions before submitting.",
          fields: issues,
        });
      const s = await tx.formSubmission.create({
        data: {
          assignmentId: id,
          formVersionId: a.formVersionId,
          version: 1,
          sourceRevision: p.expectedRevision,
          requestKey: p.requestKey,
          answers,
          submittedBy: userId,
        },
      });
      if (current)
        await tx.employeeResponse.update({
          where: { assignmentId: id },
          data: {
            status: "SUBMITTED",
            revision: { increment: 1 },
            updatedBy: userId,
          },
        });
      else
        await tx.employeeResponse.create({
          data: {
            assignmentId: id,
            status: "SUBMITTED",
            answers,
            updatedBy: userId,
          },
        });
      await this.audit(tx, userId, "RESPONSE_SUBMITTED", s.id, {
        assignmentId: id,
        formVersionId: a.formVersionId,
        version: s.version,
      });
      return this.result(tx, userId, id);
    });
  }
  private async audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    action: string,
    targetId: string,
    metadata: Prisma.InputJsonValue,
  ) {
    await tx.auditEvent.create({
      data: { actorId, action, targetId, metadata },
    });
    await tx.outboxEvent.create({ data: { type: action, targetId } });
  }
}
const openapi = (s: z.ZodType) =>
  z.toJSONSchema(s, { target: "openapi-3.0", io: "input" }) as SchemaObject;
@ApiTags("Own form responses")
@ApiUnauthorizedResponse({ type: AuthErrorDto })
@ApiForbiddenResponse({ type: AuthErrorDto })
@ApiNotFoundResponse({ type: AuthErrorDto })
@ApiConflictResponse({ type: AuthErrorDto })
@ApiBadRequestResponse({ type: ResponseValidationErrorDto })
@UseGuards(SessionGuard)
@Controller("me/assignments/:id/response")
export class ResponsesController {
  constructor(@Inject(ResponsesService) private service: ResponsesService) {}
  private user(r: AuthRequest) {
    if (!r.actor.permissions.includes("profile.own"))
      throw new ForbiddenException("An employee account is required.");
    return r.actor.id;
  }
  @Get() @ApiOkResponse({ type: ResponseDto }) get(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.get(this.user(r), id);
  }
  @Put()
  @ApiBody({ schema: openapi(saveResponseSchema) })
  @ApiOkResponse({ type: ResponseDto })
  save(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() b: unknown,
  ) {
    return this.service.save(this.user(r), id, b);
  }
  @Post("submit")
  @ApiBody({ schema: openapi(submitResponseSchema) })
  @ApiCreatedResponse({ type: ResponseDto })
  submit(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() b: unknown,
  ) {
    return this.service.submit(this.user(r), id, b);
  }
}
