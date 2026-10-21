import {
  BadRequestException,
  Body,
  CanActivate,
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
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { Database } from "./database.js";
import { AuthErrorDto, SessionGuard, type AuthRequest } from "./auth.js";
import { dto, FormDto } from "./forms.js";
import { digest } from "./security.js";
import {
  canonicalAnswersJson,
  formContentSchema,
  reviewDecisionSchema,
  reviewAccessSchema,
  saveResponseSchema,
  submitResponseSchema,
  validateAnswers,
} from "@nolt/form-schemas";
@Injectable()
export class ReviewGuard implements CanActivate {
  canActivate(context: import("@nestjs/common").ExecutionContext) {
    if (
      !context
        .switchToHttp()
        .getRequest<AuthRequest>()
        .actor?.permissions.includes("reviews.assigned")
    )
      throw new ForbiddenException("Assigned review permission is required.");
    return true;
  }
}
export class ReviewAccessDto {
  @ApiProperty({ type: Boolean }) canConfigure!: boolean;
  @ApiProperty({ type: Boolean }) canReview!: boolean;
  @ApiProperty({ type: String, nullable: true }) reviewerEmail!: string | null;
  @ApiProperty({ type: String, nullable: true }) sensitivity!: string | null;
}
export class SubmissionReviewDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ enum: ["APPROVED", "CHANGES_REQUIRED"] }) decision!: string;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ type: String }) reviewedBy!: string;
  @ApiProperty({ type: String }) reviewedAt!: string;
}
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
  @ApiProperty({ type: SubmissionReviewDto, nullable: true, required: false })
  review?: SubmissionReviewDto | null;
}
export class ResponseDto {
  @ApiProperty({ type: String }) assignmentId!: string;
  @ApiProperty({ type: FormDto }) form!: FormDto;
  @ApiProperty({ type: Number }) revision!: number;
  @ApiProperty({
    enum: ["NOT_STARTED", "DRAFT", "SUBMITTED", "CHANGES_REQUIRED", "APPROVED"],
  })
  status!: string;
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
  @ApiProperty({ type: SubmissionReviewDto, nullable: true, required: false })
  latestReview?: SubmissionReviewDto | null;
}
export class ReviewAssignmentDto {
  @ApiProperty({ type: String }) assignmentId!: string;
  @ApiProperty({ type: String }) employeeName!: string;
  @ApiProperty({ type: String }) employeeEmail!: string;
  @ApiProperty({ type: FormDto }) form!: FormDto;
  @ApiProperty({
    enum: ["NOT_STARTED", "DRAFT", "SUBMITTED", "CHANGES_REQUIRED", "APPROVED"],
  })
  status!: string;
  @ApiProperty({ type: Number }) revision!: number;
  @ApiProperty({ type: [SubmissionDto] }) submissions!: SubmissionDto[];
  @ApiProperty({ type: SubmissionReviewDto, nullable: true })
  latestReview!: SubmissionReviewDto | null;
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
/** Fill employee-record answers the employee has not touched yet. Their own entries always win. */
export function withPrefill(
  fields: unknown,
  answers: ResponseDto["answers"],
  employee: {
    fullName: string; email: string; jobTitle: string; department: string;
    startDate: Date | null; employmentType: string; employeeNumber: string | null;
  },
): ResponseDto["answers"] {
  if (!Array.isArray(fields)) return answers;
  const values: Record<string, string | null> = {
    "employee.fullName": employee.fullName,
    "employee.email": employee.email,
    "employee.jobTitle": employee.jobTitle,
    "employee.department": employee.department,
    "employee.startDate": employee.startDate ? employee.startDate.toISOString().slice(0, 10) : null,
    "employee.employmentType": employee.employmentType,
    "employee.employeeNumber": employee.employeeNumber,
  };
  const result = { ...answers };
  for (const f of fields as { id?: string; prefill?: string | null }[]) {
    if (!f?.id || !f.prefill || !(f.prefill in values)) continue;
    const current = result[f.id];
    const empty = current === undefined || current === null || (typeof current === "string" && current.trim() === "");
    if (empty && values[f.prefill]) result[f.id] = values[f.prefill];
  }
  return result;
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
      include: { review: true },
    });
    const latestReview = submissions[0]?.review ?? null;
    return {
      assignmentId: id,
      form: dto(a.formVersion),
      revision: response?.revision ?? 0,
      status: response?.status ?? "NOT_STARTED",
      updatedAt: response?.updatedAt.toISOString() ?? null,
      answers: withPrefill(
        a.formVersion.fields,
        (response?.answers ?? {}) as ResponseDto["answers"],
        a.onboardingCase.employee,
      ),
      submissions: submissions.map((s) => ({
        id: s.id,
        version: s.version,
        formVersionId: s.formVersionId,
        submittedBy: s.submittedBy,
        answers: s.answers as SubmissionDto["answers"],
        submittedAt: s.submittedAt.toISOString(),
        review: s.review
          ? {
              id: s.review.id,
              decision: s.review.decision,
              reason: s.review.reason,
              reviewedBy: s.review.reviewedBy,
              reviewedAt: s.review.reviewedAt.toISOString(),
            }
          : null,
      })),
      latestReview: latestReview
        ? {
            id: latestReview.id,
            decision: latestReview.decision,
            reason: latestReview.reason,
            reviewedBy: latestReview.reviewedBy,
            reviewedAt: latestReview.reviewedAt.toISOString(),
          }
        : null,
    };
  }
  private async assignmentForReview(
    tx: Prisma.TransactionClient,
    reviewerId: string,
    id: string,
    lock = false,
  ) {
    await this.authorizeReview(tx, reviewerId, id);
    if (lock)
      await tx.$queryRaw`SELECT c.id FROM public."OnboardingCase" c JOIN public."FormAssignment" a ON a."caseId"=c.id WHERE a.id=${id}::uuid FOR UPDATE OF c`;
    const a = await tx.formAssignment.findUnique({
      where: { id },
      include,
    });
    if (!a) throw new NotFoundException("Assigned form not found.");
    if (lock) await this.authorizeReview(tx, reviewerId, id);
    return a;
  }
  private async authorizeReview(
    tx: Prisma.TransactionClient,
    reviewerId: string,
    assignmentId: string,
  ) {
    const allowed = await tx.$queryRaw<
      { allowed: boolean }[]
    >`SELECT public.can_review_assignment(${reviewerId}::uuid,${assignmentId}::uuid) AS allowed`;
    if (!allowed[0]?.allowed)
      throw new ForbiddenException(
        "Your account lacks the required review or sensitive-data permission.",
      );
  }
  async reviewAccess(
    actorId: string,
    assignmentId: string,
  ): Promise<ReviewAccessDto> {
    return this.transaction(async (tx) => {
      const a = await tx.formAssignment.findUnique({
        where: { id: assignmentId },
        include: {
          onboardingCase: true,
          reviewAccess: { include: { reviewer: true } },
        },
      });
      const user = await tx.user.findUnique({ where: { id: actorId } });
      if (
        !a ||
        !user?.active ||
        user.role !== "HR" ||
        a.onboardingCase.status !== "ACTIVE"
      )
        throw new NotFoundException("Assigned review not found.");
      const allowed = await tx.$queryRaw<
        { allowed: boolean }[]
      >`SELECT public.can_review_assignment(${actorId}::uuid,${assignmentId}::uuid) AS allowed`;
      return {
        canConfigure: false,
        canReview: allowed[0]?.allowed ?? false,
        reviewerEmail: a.reviewAccess?.reviewer.email ?? null,
        sensitivity: a.reviewAccess?.sensitivity ?? null,
      };
    });
  }
  async assignReviewer(actorId: string, assignmentId: string, input: unknown) {
    const p = parse(reviewAccessSchema, input);
    return this.transaction(async (tx) => {
      await tx.$queryRaw`SELECT c.id FROM public."OnboardingCase" c JOIN public."FormAssignment" a ON a."caseId"=c.id WHERE a.id=${assignmentId}::uuid FOR UPDATE OF c`;
      const a = await tx.formAssignment.findUnique({
        where: { id: assignmentId },
        include: { onboardingCase: true, formVersion: true },
      });
      const actor = await tx.user.findUnique({ where: { id: actorId } });
      if (
        !a ||
        !actor?.active ||
        actor.role !== "HR" ||
        a.onboardingCase.createdBy !== actorId
      )
        throw new NotFoundException("Owned assignment not found.");
      if (
        a.onboardingCase.status !== "ACTIVE" ||
        a.formVersion.recipient !== "EMPLOYEE"
      )
        throw new ConflictException(
          "Review access requires an active employee-form assignment.",
        );
      const reviewer = await tx.user.findUnique({
        where: { email: p.reviewerEmail },
      });
      if (!reviewer?.active || reviewer.role !== "HR")
        throw new BadRequestException(
          "Choose an existing active HR account.",
        );
      const existing = await tx.assignmentReviewAccess.findUnique({
        where: { assignmentId },
      });
      if (existing) {
        if (
          existing.reviewerId === reviewer.id &&
          existing.sensitivity === p.sensitivity
        )
          return { configured: true };
        throw new ConflictException(
          "Review access is already configured. Reassignment requires a separate authorised process.",
        );
      }
      await tx.assignmentReviewAccess.create({
        data: {
          assignmentId,
          reviewerId: reviewer.id,
          sensitivity: p.sensitivity,
          grantedBy: actorId,
        },
      });
      await this.audit(tx, actorId, "REVIEW_ACCESS_ASSIGNED", assignmentId, {
        reviewerId: reviewer.id,
        sensitivity: p.sensitivity,
      });
      return { configured: true };
    });
  }
  private async reviewResult(
    tx: Prisma.TransactionClient,
    reviewerId: string,
    assignmentId: string,
  ): Promise<ReviewAssignmentDto> {
    const a = await this.assignmentForReview(tx, reviewerId, assignmentId);
    const response = await tx.employeeResponse.findUnique({
      where: { assignmentId },
    });
    const submissions = await tx.formSubmission.findMany({
      where: { assignmentId },
      orderBy: { version: "desc" },
      include: { review: true },
    });
    const latestReview = submissions[0]?.review ?? null;
    return {
      assignmentId,
      employeeName: a.onboardingCase.employee.fullName,
      employeeEmail: a.onboardingCase.employee.email,
      form: dto(a.formVersion),
      revision: response?.revision ?? 0,
      status: response?.status ?? "NOT_STARTED",
      submissions: submissions.map((s) => ({
        id: s.id,
        version: s.version,
        formVersionId: s.formVersionId,
        submittedBy: s.submittedBy,
        answers: s.answers as SubmissionDto["answers"],
        submittedAt: s.submittedAt.toISOString(),
        review: s.review
          ? {
              id: s.review.id,
              decision: s.review.decision,
              reason: s.review.reason,
              reviewedBy: s.review.reviewedBy,
              reviewedAt: s.review.reviewedAt.toISOString(),
            }
          : null,
      })),
      latestReview: latestReview
        ? {
            id: latestReview.id,
            decision: latestReview.decision,
            reason: latestReview.reason,
            reviewedBy: latestReview.reviewedBy,
            reviewedAt: latestReview.reviewedAt.toISOString(),
          }
        : null,
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
  async getReview(reviewerId: string, assignmentId: string) {
    return this.db.$transaction(
      (tx) => this.reviewResult(tx, reviewerId, assignmentId),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 15000,
        maxWait: 10000,
      },
    );
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
        current?.status === "APPROVED" ||
        (current?.revision ?? 0) !== p.expectedRevision
      )
        throw new ConflictException(
          "This response changed, was approved, or is awaiting review. Reload before saving.",
        );
      const fields = formContentSchema.parse(a.formVersion).fields;
      const { answers, issues } = validateAnswers(fields, p.answers, false);
      if (issues.length)
        throw new BadRequestException({
          message: "Check the highlighted questions.",
          fields: issues,
        });
      if (
        canonicalAnswersJson(
          fields,
          (current?.answers ?? {}) as Record<string, string | boolean | null>,
        ) !== canonicalAnswersJson(fields, answers)
      ) {
        for (const field of fields)
          if (field.type === "signature") delete answers[field.id];
      }
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
        current?.status === "APPROVED" ||
        (current?.revision ?? 0) !== p.expectedRevision
      )
        throw new ConflictException(
          "This response changed, was approved, or is awaiting review. Reload before submitting.",
        );
      const fields = formContentSchema.parse(a.formVersion).fields;
      const { answers, issues } = validateAnswers(
        fields,
        current?.answers ?? {},
        true,
      );

      // Verify untrusted file and signature references
      for (const f of fields) {
        const val = answers[f.id];
        if (f.type === "file" && typeof val === "string" && val.trim()) {
          const file = await tx.storedFile.findUnique({
            where: { id: val.trim() },
          });
          if (
            !file ||
            file.assignmentId !== id ||
            file.fieldId !== f.id ||
            file.uploadedBy !== userId
          ) {
            issues.push({
              fieldId: f.id,
              message: "Invalid file attachment reference.",
            });
          } else if (
            file.status !== "CONFIRMED" ||
            file.scanStatus !== "CLEAN"
          ) {
            issues.push({
              fieldId: f.id,
              message: "Attachment has not passed security scanning.",
            });
          }
        }
        if (f.type === "signature" && typeof val === "string" && val.trim()) {
          const evidence = await tx.signatureEvidence.findUnique({
            where: { id: val.trim() },
            include: { file: true },
          });
          if (
            !evidence ||
            evidence.assignmentId !== id ||
            evidence.fieldId !== f.id ||
            evidence.signerId !== userId
          ) {
            issues.push({
              fieldId: f.id,
              message: "Invalid signature reference.",
            });
          } else if (
            evidence.file.status !== "CONFIRMED" ||
            evidence.file.scanStatus !== "CLEAN"
          ) {
            issues.push({
              fieldId: f.id,
              message: "Signature image has not passed security scanning.",
            });
          } else {
            const expectedDigest = digest(
              "answers:" +
                canonicalAnswersJson(
                  fields,
                  (current?.answers ?? {}) as Record<
                    string,
                    string | boolean | null
                  >,
                ),
            );
            if (evidence.contentDigest !== expectedDigest) {
              issues.push({
                fieldId: f.id,
                message:
                  "Answers were changed after signing. Please sign again before submitting.",
              });
            }
          }
        }
      }

      if (issues.length)
        throw new BadRequestException({
          message: "Complete the highlighted questions before submitting.",
          fields: issues,
        });

      const latest = await tx.formSubmission.findFirst({
        where: { assignmentId: id },
        orderBy: { version: "desc" },
        include: { review: true },
      });
      let nextVersion = 1;
      if (latest) {
        if (latest.review?.decision !== "CHANGES_REQUIRED") {
          throw new ConflictException(
            "This form has already been submitted and cannot be resubmitted without requested changes.",
          );
        }
        nextVersion = latest.version + 1;
      }

      const s = await tx.formSubmission.create({
        data: {
          assignmentId: id,
          formVersionId: a.formVersionId,
          version: nextVersion,
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
  async decide(reviewerId: string, submissionId: string, input: unknown) {
    const p = parse(reviewDecisionSchema, input);
    return this.transaction(async (tx) => {
      const target = await tx.formSubmission.findUnique({
        where: { id: submissionId },
        select: { assignmentId: true },
      });
      if (!target) throw new NotFoundException("Assigned review not found.");
      await this.assignmentForReview(tx, reviewerId, target.assignmentId, true);
      const submission = await tx.formSubmission.findUnique({
        where: { id: submissionId },
        include: {
          assignment: {
            include: {
              response: true,
              onboardingCase: true,
            },
          },
          review: true,
        },
      });
      if (!submission) throw new NotFoundException("Submission not found.");
      if (submission.assignment.onboardingCase.status !== "ACTIVE")
        throw new ConflictException("This onboarding case is closed.");
      if (submission.review)
        throw new ConflictException(
          "A decision was already recorded for this submission.",
        );
      if (submission.version !== p.expectedSubmissionVersion)
        throw new ConflictException(
          "Submission version mismatch. Reload before reviewing.",
        );
      const current = submission.assignment.response;
      if (
        !current ||
        current.status !== "SUBMITTED" ||
        current.revision !== p.expectedResponseRevision
      )
        throw new ConflictException(
          "The response changed or is not awaiting review. Reload before reviewing.",
        );

      const reviewRecord = await tx.submissionReview.create({
        data: {
          id: randomUUID(),
          submissionId,
          decision: p.decision,
          reason: p.decision === "CHANGES_REQUIRED" ? p.reason.trim() : null,
          reviewedBy: reviewerId,
        },
      });

      const nextStatus =
        p.decision === "APPROVED" ? "APPROVED" : "CHANGES_REQUIRED";
      await tx.employeeResponse.update({
        where: { assignmentId: submission.assignmentId },
        data: {
          status: nextStatus,
          revision: { increment: 1 },
          updatedBy: reviewerId,
        },
      });

      const action =
        p.decision === "APPROVED"
          ? "REVIEW_APPROVED"
          : "REVIEW_CHANGES_REQUIRED";
      await this.audit(tx, reviewerId, action, reviewRecord.id, {
        assignmentId: submission.assignmentId,
        submissionId,
        version: submission.version,
        decision: p.decision,
      });

      return this.reviewResult(tx, reviewerId, submission.assignmentId);
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
@ApiTags("HR submission reviews")
@ApiUnauthorizedResponse({ type: AuthErrorDto })
@ApiForbiddenResponse({ type: AuthErrorDto })
@ApiNotFoundResponse({ type: AuthErrorDto })
@ApiConflictResponse({ type: AuthErrorDto })
@ApiBadRequestResponse({ type: AuthErrorDto })
@UseGuards(SessionGuard, ReviewGuard)
@Controller()
export class ReviewsController {
  constructor(@Inject(ResponsesService) private service: ResponsesService) {}

  @Get("assignments/:id/review")
  @ApiOkResponse({ type: ReviewAssignmentDto })
  getReview(@Req() r: AuthRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.getReview(r.actor.id, id);
  }
  @Get("assignments/:id/review-access")
  @ApiOkResponse({ type: ReviewAccessDto })
  reviewAccess(@Req() r: AuthRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.reviewAccess(r.actor.id, id);
  }
  @Post("assignments/:id/review-access")
  @ApiBody({ schema: openapi(reviewAccessSchema) })
  @ApiCreatedResponse({
    schema: {
      type: "object",
      properties: { configured: { type: "boolean" } },
      required: ["configured"],
    },
  })
  assignReviewer(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() b: unknown,
  ) {
    return this.service.assignReviewer(r.actor.id, id, b);
  }

  @Post("submissions/:id/decisions")
  @ApiBody({ schema: openapi(reviewDecisionSchema) })
  @ApiCreatedResponse({ type: ReviewAssignmentDto })
  decide(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() b: unknown,
  ) {
    return this.service.decide(r.actor.id, id, b);
  }
}
