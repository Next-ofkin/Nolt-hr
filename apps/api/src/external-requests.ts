import {
  ExternalSessions,
  ExternalSessionGuard,
  ExternalSessionDto,
} from "./external-sessions.js";
import { externalInvitation } from "./external-email.js";
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
  Res,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
  ApiUnauthorizedResponse,
  type SchemaObject,
} from "@nestjs/swagger";
import type { Prisma, ExternalRequest } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import type { Request, Response } from "express";
import { z } from "zod";
import {
  formContentSchema,
  saveResponseSchema,
  submitResponseSchema,
  validateAnswers,
} from "@nolt/form-schemas";
import {
  AuthErrorDto,
  AuthNextDto,
  SessionGuard,
  type AuthRequest,
} from "./auth.js";
import { Database } from "./database.js";
import { SupabaseAuth } from "./supabase-auth.js";
import {
  appOrigin,
  assertOrigin,
  clearCookie,
  digest,
  LoginLimiter,
} from "./security.js";
import { dto as formDto, FormDto } from "./forms.js";

export const createExternalSchema = z
  .object({
    expectedContactRevision: z.number().int().positive(),
    requestKey: z.string().uuid(),
    replaceRequestId: z.string().uuid().optional(),
  })
  .strict();
export const externalExchangeSchema = z
  .object({
    requestId: z.string().uuid(),
    proof: z.union([
      z
        .object({
          access_token: z.string().min(20).max(10000),
          refresh_token: z.string().min(10).max(10000),
        })
        .strict(),
      z
        .object({
          tokenHash: z.string().min(20).max(512),
          type: z.enum(["invite", "magiclink", "signup", "email"]),
        })
        .strict(),
    ]),
  })
  .strict();
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const p = schema.safeParse(input);
  if (!p.success) throw new BadRequestException("Check the request fields.");
  return p.data;
}
const schema = (s: z.ZodType) =>
  z.toJSONSchema(s, { target: "openapi-3.0", io: "input" }) as SchemaObject;
const options = { timeout: 15000, maxWait: 10000 };
const terminal = ["REVOKED", "EXPIRED", "FAILED"];
export class ExternalRequestDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) assignmentId!: string;
  @ApiProperty({ type: String }) state!: string;
  @ApiProperty({ type: String }) expiresAt!: string;
  @ApiProperty({ type: String }) createdAt!: string;
  @ApiProperty({ type: String }) email!: string;
}
export class ExternalRequestsDto {
  @ApiProperty({ type: [ExternalRequestDto] }) items!: ExternalRequestDto[];
}
export class ExternalWorkspaceDto {
  @ApiProperty({ type: String }) requestId!: string;
  @ApiProperty({ type: FormDto }) form!: FormDto;
  @ApiProperty({ type: Number }) revision!: number;
  @ApiProperty({ type: String }) state!: string;
  @ApiProperty({
    type: Object,
    additionalProperties: {
      oneOf: [{ type: "string", nullable: true }, { type: "boolean" }],
    },
  })
  answers!: Record<string, string | boolean | null>;
}
function dto(r: ExternalRequest): ExternalRequestDto {
  return {
    id: r.id,
    assignmentId: r.assignmentId,
    state:
      !["SUBMITTED", ...terminal].includes(r.state) && r.expiresAt <= new Date()
        ? "EXPIRED"
        : r.state,
    email: r.email,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
  };
}
@Injectable()
export class ExternalRequestsService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(SupabaseAuth) private auth: SupabaseAuth,
    @Inject(ExternalSessions) private sessions: ExternalSessions,
  ) {}
  private async event(
    tx: Prisma.TransactionClient,
    actorId: string,
    action: string,
    targetId: string,
  ) {
    await tx.auditEvent.create({ data: { actorId, action, targetId } });
    await tx.outboxEvent.create({ data: { type: action, targetId } });
  }
  private async own(
    tx: Prisma.TransactionClient,
    actorId: string,
    assignmentId: string,
  ) {
    const a = await tx.formAssignment.findFirst({
      where: {
        id: assignmentId,
        onboardingCase: {
          status: "ACTIVE",
          employee: { userId: actorId, user: { active: true } },
        },
      },
      include: { formVersion: true },
    });
    if (!a) throw new NotFoundException("Assigned form not found.");
    if (!["GUARANTOR", "REFERENCE"].includes(a.formVersion.recipient))
      throw new ForbiddenException(
        "This form cannot be sent to a third party.",
      );
    return a;
  }
  private lockCase(tx: Prisma.TransactionClient, id: string) {
    return tx.$queryRaw`SELECT c.id FROM public."OnboardingCase" c JOIN public."FormAssignment" a ON a."caseId"=c.id WHERE a.id=${id}::uuid FOR UPDATE OF c`;
  }
  async list(
    actorId: string,
    assignmentId: string,
  ): Promise<ExternalRequestsDto> {
    return this.db.$transaction(async (tx) => {
      await this.own(tx, actorId, assignmentId);
      return {
        items: (
          await tx.externalRequest.findMany({
            where: { assignmentId },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 20,
          })
        ).map(dto),
      };
    }, options);
  }
  async create(actorId: string, assignmentId: string, input: unknown) {
    const p = parse(createExternalSchema, input),
      hash = digest(JSON.stringify(p));
    const result = await this.db.$transaction(async (tx) => {
      await this.lockCase(tx, assignmentId);
      await this.own(tx, actorId, assignmentId);
      const replay = await tx.externalRequest.findUnique({
        where: {
          assignmentId_requestKey: { assignmentId, requestKey: p.requestKey },
        },
      });
      if (replay) {
        if (replay.requestHash !== hash)
          throw new ConflictException(
            "Request key was used for different details.",
          );
        return dto(replay);
      }
      const contact = await tx.externalContactDraft.findUnique({
        where: { assignmentId },
      });
      if (!contact || contact.revision !== p.expectedContactRevision)
        throw new ConflictException(
          "Save and reload the recipient details before sending.",
        );
      const current = await tx.externalRequest.findFirst({
        where: { assignmentId, state: { notIn: terminal } },
      });
      if (current) {
        if (current.state === "SUBMITTED")
          throw new ConflictException(
            "Submitted recipient evidence is locked. HR must manage any replacement.",
          );
        if (current.expiresAt > new Date() && p.replaceRequestId !== current.id)
          throw new ConflictException(
            "A request is already active. Explicitly replace it to issue another link.",
          );
        await tx.externalRequest.update({
          where: { id: current.id },
          data: {
            state: current.expiresAt <= new Date() ? "EXPIRED" : "REVOKED",
            updatedBy: actorId,
            revokedAt: new Date(),
          },
        });
        await tx.externalDelivery.updateMany({
          where: {
            requestId: current.id,
            state: { in: ["PENDING", "SENDING"] },
          },
          data: { state: "CANCELLED", leaseUntil: null },
        });
        await this.event(tx, actorId, "EXTERNAL_REQUEST_REPLACED", current.id);
      } else if (p.replaceRequestId) {
        const old = await tx.externalRequest.findFirst({
          where: { id: p.replaceRequestId, assignmentId },
        });
        if (!old || old.state === "SUBMITTED")
          throw new ConflictException("Replacement target is invalid.");
      }
      const r = await tx.externalRequest.create({
        data: {
          assignmentId,
          requestKey: p.requestKey,
          requestHash: hash,
          contactRevision: contact.revision,
          fullName: contact.fullName,
          email: contact.email,
          createdBy: actorId,
          updatedBy: actorId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      await tx.externalDelivery.create({ data: { requestId: r.id } });
      await this.event(tx, actorId, "EXTERNAL_REQUEST_QUEUED", r.id);
      return dto(r);
    }, options);
    setImmediate(() => {
      void this.deliverNext(result.id).catch(() => {});
    });
    return result;
  }
  async revoke(actorId: string, assignmentId: string, id: string) {
    return this.db.$transaction(async (tx) => {
      await this.lockCase(tx, assignmentId);
      await this.own(tx, actorId, assignmentId);
      const r = await tx.externalRequest.findFirst({
        where: { id, assignmentId },
      });
      if (!r) throw new NotFoundException();
      if (r.state === "SUBMITTED")
        throw new ConflictException(
          "Submitted evidence cannot be revoked by the employee.",
        );
      if (!terminal.includes(r.state)) {
        await tx.externalRequest.update({
          where: { id },
          data: { state: "REVOKED", revokedAt: new Date(), updatedBy: actorId },
        });
        await tx.externalDelivery.updateMany({
          where: { requestId: id, state: { in: ["PENDING", "SENDING"] } },
          data: { state: "CANCELLED", leaseUntil: null },
        });
        await this.event(tx, actorId, "EXTERNAL_REQUEST_REVOKED", id);
      }
      return dto(await tx.externalRequest.findUniqueOrThrow({ where: { id } }));
    }, options);
  }
  private valid(r: ExternalRequest | null, allowSubmitted = false) {
    if (
      !r ||
      r.revokedAt ||
      r.expiresAt <= new Date() ||
      ![
        "SENT",
        "UNCERTAIN",
        "ACTIVE",
        ...(allowSubmitted ? ["SUBMITTED"] : []),
      ].includes(r.state)
    )
      throw new ForbiddenException(
        "This request is unavailable, expired or replaced. Ask the employee for a new request.",
      );
    return r;
  }
  async exchange(input: unknown, req: Request, res: Response) {
    const p = parse(externalExchangeSchema, input);
    const r = this.valid(
      await this.db.externalRequest.findUnique({ where: { id: p.requestId } }),
    );
    let tokens;
    if ("tokenHash" in p.proof) {
      const { client } = this.auth.client();
      const v = await client.auth.verifyOtp({
        token_hash: p.proof.tokenHash,
        type: p.proof.type,
      });
      if (v.error || !v.data.session)
        throw new ForbiddenException(
          "Email verification failed or was already used.",
        );
      tokens = this.auth.tokens(v.data.session);
    } else tokens = p.proof;
    const checked = await this.auth.authenticated(tokens),
      member = await this.auth.member(checked.user.id);
    if (
      checked.user.email?.toLowerCase() !== r.email ||
      member.email.toLowerCase() !== r.email ||
      member.id === r.createdBy ||
      member.role !== "EMPLOYEE" ||
      (r.respondentId && r.respondentId !== member.id)
    )
      throw new ForbiddenException(
        "This request belongs to a different verified recipient.",
      );
    const session = await this.db.$transaction(async (tx) => {
      await this.lockCase(tx, r.assignmentId);
      const current = this.valid(
        await tx.externalRequest.findUnique({ where: { id: r.id } }),
      );
      if (current.respondentId && current.respondentId !== member.id)
        throw new ForbiddenException(
          "This request belongs to another recipient.",
        );
      const assignment = await tx.formAssignment.findUniqueOrThrow({
        where: { id: current.assignmentId },
        include: { onboardingCase: true },
      });
      if (assignment.onboardingCase.status !== "ACTIVE")
        throw new ForbiddenException("This request is closed.");
      if (current.state !== "ACTIVE")
        await tx.externalRequest.update({
          where: { id: current.id },
          data: {
            state: "ACTIVE",
            respondentId: member.id,
            updatedBy: member.id,
          },
        });
      await this.event(tx, member.id, "EXTERNAL_REQUEST_OPENED", current.id);
      return this.sessions.issue(tx, member, current.id, current.expiresAt);
    }, options);
    this.sessions.attach(res, session);
    return { next: "external-workspace" };
  }
  async activate(_req: Request, _res: Response) {
    throw new ForbiddenException(
      "Open the form invitation directly. Staff setup is no longer required for this request.",
    );
  }
  session(req: AuthRequest) {
    return this.sessions.authenticate(req);
  }
  async logout(req: AuthRequest, res: Response) {
    await this.db.$transaction(async (tx) => {
      const changed = await tx.externalEmailSession.updateMany({
        where: { id: req.sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (changed.count)
        await this.event(
          tx,
          req.actor.id,
          "EXTERNAL_SESSION_CLOSED",
          req.externalRequestId!,
        );
    }, options);
    clearCookie(res, "external");
    return { next: "closed" };
  }
  private async scoped(tx: Prisma.TransactionClient, req: AuthRequest) {
    if (!req.externalRequestId)
      throw new ForbiddenException(
        "A request-scoped recipient session is required.",
      );
    const r = this.valid(
      await tx.externalRequest.findUnique({
        where: { id: req.externalRequestId },
      }),
      true,
    );
    if (
      r.respondentId !== req.actor.id ||
      req.actor.email.toLowerCase() !== r.email ||
      r.createdBy === req.actor.id
    )
      throw new ForbiddenException(
        "This request belongs to another recipient.",
      );
    const a = await tx.formAssignment.findUniqueOrThrow({
      where: { id: r.assignmentId },
      include: { formVersion: true, onboardingCase: true },
    });
    if (a.onboardingCase.status !== "ACTIVE")
      throw new ForbiddenException("The onboarding case is closed.");
    return { r, a };
  }
  private result(
    r: ExternalRequest,
    a: { formVersion: Parameters<typeof formDto>[0] },
  ): ExternalWorkspaceDto {
    return {
      requestId: r.id,
      form: formDto(a.formVersion),
      revision: r.revision,
      state: r.state,
      answers: r.answers as ExternalWorkspaceDto["answers"],
    };
  }
  async get(req: AuthRequest) {
    return this.db.$transaction(async (tx) => {
      const { r, a } = await this.scoped(tx, req);
      return this.result(r, a);
    }, options);
  }
  async save(req: AuthRequest, input: unknown) {
    const p = parse(saveResponseSchema, input);
    return this.db.$transaction(async (tx) => {
      if (!req.externalRequestId)
        throw new ForbiddenException(
          "A request-scoped recipient session is required.",
        );
      const target = await tx.externalRequest.findUniqueOrThrow({
        where: { id: req.externalRequestId },
      });
      await this.lockCase(tx, target.assignmentId);
      const { r, a } = await this.scoped(tx, req);
      if (r.state !== "ACTIVE" || r.revision !== p.expectedRevision)
        throw new ConflictException(
          "This response changed or was submitted. Reload before saving.",
        );
      const fields = formContentSchema.parse(a.formVersion).fields;
      for (const field of fields)
        if (
          ["file", "signature"].includes(field.type) &&
          p.answers[field.id] != null &&
          p.answers[field.id] !== ""
        )
          throw new BadRequestException(
            "External file/signature capture is not available yet.",
          );
      const { answers, issues } = validateAnswers(fields, p.answers, false);
      if (issues.length)
        throw new BadRequestException({
          message: "Check your answers.",
          fields: issues,
        });
      const saved = await tx.externalRequest.update({
        where: { id: r.id },
        data: { answers, revision: { increment: 1 }, updatedBy: req.actor.id },
      });
      await this.event(tx, req.actor.id, "EXTERNAL_DRAFT_SAVED", r.id);
      return this.result(saved, a);
    }, options);
  }
  async submit(req: AuthRequest, input: unknown) {
    const p = parse(submitResponseSchema, input);
    return this.db.$transaction(async (tx) => {
      if (!req.externalRequestId)
        throw new ForbiddenException(
          "A request-scoped recipient session is required.",
        );
      const target = await tx.externalRequest.findUniqueOrThrow({
        where: { id: req.externalRequestId },
      });
      await this.lockCase(tx, target.assignmentId);
      const { r, a } = await this.scoped(tx, req);
      const replay = await tx.externalSubmission.findUnique({
        where: { requestId: r.id },
      });
      if (replay) {
        if (
          replay.requestKey !== p.requestKey ||
          replay.sourceRevision !== p.expectedRevision
        )
          throw new ConflictException("This response was already submitted.");
        return this.result(r, a);
      }
      if (r.state !== "ACTIVE" || r.revision !== p.expectedRevision)
        throw new ConflictException(
          "This response changed. Reload before submitting.",
        );
      const fields = formContentSchema.parse(a.formVersion).fields;
      if (
        fields.some((f) => ["file", "signature"].includes(f.type) && f.required)
      )
        throw new ServiceUnavailableException(
          "This form requires files or signatures. Submission is blocked until secure external capture is available.",
        );
      const { issues } = validateAnswers(fields, r.answers, true);
      if (issues.length)
        throw new BadRequestException({
          message: "Complete the required questions.",
          fields: issues,
        });
      await tx.externalSubmission.create({
        data: {
          requestId: r.id,
          requestKey: p.requestKey,
          sourceRevision: r.revision,
          answers: r.answers as Prisma.InputJsonValue,
          submittedBy: req.actor.id,
        },
      });
      const saved = await tx.externalRequest.update({
        where: { id: r.id },
        data: {
          state: "SUBMITTED",
          updatedBy: req.actor.id,
          revision: { increment: 1 },
          submittedAt: new Date(),
        },
      });
      await this.event(tx, req.actor.id, "EXTERNAL_RESPONSE_SUBMITTED", r.id);
      return this.result(saved, a);
    }, options);
  }

  // Generates proof without sending Supabase's staff invitation template.
  async sendEmail(email: string, requestId: string) {
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL)
      return { code: "SENDER_NOT_CONFIGURED", status: 400 };
    const client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (url, init) =>
            fetch(url, { ...init, signal: AbortSignal.timeout(25000) }),
        },
      },
    );
    const generated = await client.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (generated.error || !generated.data.properties?.hashed_token)
      return {
        code: "PROOF_GENERATION_FAILED",
        status: generated.error?.status ?? 400,
      };
    const row = await this.db.externalRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { assignment: { include: { formVersion: true } } },
    });
    const proofType = generated.data.properties.verification_type;
    if (!["magiclink", "invite", "signup", "email"].includes(proofType))
      return { code: "PROOF_TYPE_UNSUPPORTED", status: 400 };
    // Fragment keeps proof out of request logs/referrers; it is cleared before API exchange.
    const link =
      appOrigin() +
      "/external/accept?id=" +
      requestId +
      "#token_hash=" +
      encodeURIComponent(generated.data.properties.hashed_token) +
      "&type=" +
      encodeURIComponent(proofType);
    const message = externalInvitation(
      row.assignment.formVersion.title,
      link,
      row.expiresAt,
    );
    const result = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(25000),
      headers: {
        Authorization: "Bearer " + process.env.RESEND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL,
        to: [email],
        ...message,
      }),
    });
    if (!result.ok)
      return { code: "EMAIL_PROVIDER_REJECTED", status: result.status };
    return null;
  }
  async deliverNext(onlyRequestId?: string) {
    // Lost leases are uncertain: never automatically send a second email after a crash.
    await this.db.$transaction(async (tx) => {
      const stale = await tx.externalDelivery.findMany({
        where: {
          state: "SENDING",
          leaseUntil: { lt: new Date() },
          ...(onlyRequestId ? { requestId: onlyRequestId } : {}),
        },
        take: 20,
      });
      for (const j of stale) {
        await tx.$queryRaw`SELECT id FROM public."ExternalRequest" WHERE id=${j.requestId}::uuid FOR UPDATE`;
        const lease = await tx.externalDelivery.findUniqueOrThrow({
          where: { requestId: j.requestId },
        });
        if (
          lease.state !== "SENDING" ||
          !lease.leaseUntil ||
          lease.leaseUntil > new Date()
        )
          continue;
        const r = await tx.externalRequest.findUniqueOrThrow({
          where: { id: j.requestId },
        });
        await tx.externalDelivery.update({
          where: { requestId: j.requestId },
          data: {
            state: r.state === "SENDING" ? "UNCERTAIN" : "CANCELLED",
            leaseUntil: null,
            errorCode: "DELIVERY_UNCERTAIN",
          },
        });
        if (r.state === "SENDING") {
          await tx.externalRequest.update({
            where: { id: r.id },
            data: { state: "UNCERTAIN" },
          });
          await this.event(
            tx,
            r.createdBy,
            "EXTERNAL_DELIVERY_UNCERTAIN",
            r.id,
          );
        }
      }
    }, options);
    const job = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT r.id FROM public."ExternalRequest" r JOIN public."ExternalDelivery" d ON d."requestId"=r.id WHERE r.state='QUEUED' AND d.state='PENDING' AND d."availableAt"<=now() AND (${onlyRequestId ?? null}::uuid IS NULL OR r.id=${onlyRequestId ?? null}::uuid) ORDER BY d."availableAt",r.id FOR UPDATE OF r SKIP LOCKED LIMIT 1`;
      if (!rows.length) return null;
      const r = await tx.externalRequest.findUniqueOrThrow({
        where: { id: rows[0].id },
      });
      if (r.expiresAt <= new Date()) {
        await tx.externalRequest.update({
          where: { id: r.id },
          data: { state: "EXPIRED" },
        });
        await tx.externalDelivery.update({
          where: { requestId: r.id },
          data: { state: "CANCELLED" },
        });
        return null;
      }
      await tx.externalRequest.update({
        where: { id: r.id },
        data: { state: "SENDING" },
      });
      const d = await tx.externalDelivery.update({
        where: { requestId: r.id },
        data: {
          state: "SENDING",
          attempts: { increment: 1 },
          leaseUntil: new Date(Date.now() + 90000),
        },
      });
      return { r, d };
    }, options);
    if (!job) return false;
    let error: { code: string; status?: number } | null = null;
    const approvedFilter = process.env.EXTERNAL_TEST_RECIPIENTS;
    const approved =
      approvedFilter !== undefined
        ? approvedFilter
            .split(",")
            .map((v) => v.trim().toLowerCase())
            .filter(Boolean)
        : null;
    if (approved && !approved.includes(job.r.email.toLowerCase()))
      error = { code: "RECIPIENT_NOT_APPROVED", status: 403 };
    else if (
      !process.env.SUPABASE_SECRET_KEY ||
      !process.env.SUPABASE_PUBLISHABLE_KEY
    )
      error = { code: "SENDER_NOT_CONFIGURED", status: 400 };
    else
      try {
        error = await this.sendEmail(job.r.email, job.r.id);
      } catch {
        error = { code: "DELIVERY_UNCERTAIN" };
      }
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM public."ExternalRequest" WHERE id=${job.r.id}::uuid FOR UPDATE`;
      const r = await tx.externalRequest.findUniqueOrThrow({
        where: { id: job.r.id },
      });
      if (r.state !== "SENDING") {
        await tx.externalDelivery.update({
          where: { requestId: r.id },
          data: { state: "CANCELLED", leaseUntil: null },
        });
        return;
      }
      const uncertain = error && (!error.status || error.status >= 500);
      const retry =
        error?.status === 429 &&
        job.d.attempts < 5 &&
        r.expiresAt.getTime() > Date.now() + 60000;
      const state = !error
        ? "SENT"
        : uncertain
          ? "UNCERTAIN"
          : retry
            ? "QUEUED"
            : "FAILED";
      await tx.externalRequest.update({
        where: { id: r.id },
        data: { state, ...(!error ? { sentAt: new Date() } : {}) },
      });
      await tx.externalDelivery.update({
        where: { requestId: r.id },
        data: {
          state: retry ? "PENDING" : (state as "SENT"),
          leaseUntil: null,
          errorCode: error?.code ?? null,
          availableAt: new Date(
            Date.now() + Math.min(900, 60 * 2 ** (job.d.attempts - 1)) * 1000,
          ),
        },
      });
      await this.event(
        tx,
        r.createdBy,
        !error ? "EXTERNAL_REQUEST_SENT" : "EXTERNAL_DELIVERY_FAILED",
        r.id,
      );
    }, options);
    return true;
  }
}

@ApiTags("External requests")
@ApiBadRequestResponse({ type: AuthErrorDto })
@ApiUnauthorizedResponse({ type: AuthErrorDto })
@ApiForbiddenResponse({ type: AuthErrorDto })
@ApiNotFoundResponse({ type: AuthErrorDto })
@ApiConflictResponse({ type: AuthErrorDto })
@UseGuards(SessionGuard)
@Controller("me/assignments/:id/external-requests")
export class ExternalRequestsController {
  constructor(
    @Inject(ExternalRequestsService) private service: ExternalRequestsService,
  ) {}
  private own(r: AuthRequest) {
    if (!r.actor.permissions.includes("profile.own") || r.externalRequestId)
      throw new ForbiddenException(
        "An employee workspace session is required.",
      );
  }
  @Get() @ApiOkResponse({ type: ExternalRequestsDto }) list(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    this.own(r);
    return this.service.list(r.actor.id, id);
  }
  @Post()
  @ApiBody({ schema: schema(createExternalSchema) })
  @ApiCreatedResponse({ type: ExternalRequestDto })
  create(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() b: unknown,
  ) {
    this.own(r);
    return this.service.create(r.actor.id, id, b);
  }
  @Post(":requestId/revoke")
  @ApiCreatedResponse({ type: ExternalRequestDto })
  revoke(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("requestId", ParseUUIDPipe) requestId: string,
  ) {
    this.own(r);
    return this.service.revoke(r.actor.id, id, requestId);
  }
}
@ApiTags("Recipient workspace")
@ApiUnauthorizedResponse({ type: AuthErrorDto })
@ApiForbiddenResponse({ type: AuthErrorDto })
@ApiBadRequestResponse({ type: AuthErrorDto })
@ApiConflictResponse({ type: AuthErrorDto })
@Controller("external")
export class ExternalWorkspaceController {
  private limiter = new LoginLimiter(30);
  constructor(
    @Inject(ExternalRequestsService) private service: ExternalRequestsService,
  ) {}
  private protect(r: Request) {
    assertOrigin(r);
    this.limiter.take(r.ip ?? "unknown");
  }
  @Post("exchange")
  @ApiBody({ schema: schema(externalExchangeSchema) })
  @ApiCreatedResponse({ type: AuthNextDto })
  exchange(
    @Req() r: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() b: unknown,
  ) {
    this.protect(r);
    return this.service.exchange(b, r, res);
  }
  @Post("activate") @ApiCreatedResponse({ type: AuthNextDto }) activate(
    @Req() r: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.protect(r);
    return this.service.activate(r, res);
  }
  @Get("session")
  @ApiOkResponse({ type: ExternalSessionDto })
  session(@Req() r: AuthRequest) {
    return this.service.session(r);
  }
  @Post("logout")
  @UseGuards(ExternalSessionGuard)
  @ApiCreatedResponse({ type: AuthNextDto })
  logout(@Req() r: AuthRequest, @Res({ passthrough: true }) res: Response) {
    return this.service.logout(r, res);
  }
  @Get("request")
  @UseGuards(ExternalSessionGuard)
  @ApiOkResponse({ type: ExternalWorkspaceDto })
  get(@Req() r: AuthRequest) {
    return this.service.get(r);
  }
  @Put("request/draft")
  @UseGuards(ExternalSessionGuard)
  @ApiBody({ schema: schema(saveResponseSchema) })
  @ApiOkResponse({ type: ExternalWorkspaceDto })
  save(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.save(r, b);
  }
  @Post("request/submit")
  @UseGuards(ExternalSessionGuard)
  @ApiBody({ schema: schema(submitResponseSchema) })
  @ApiCreatedResponse({ type: ExternalWorkspaceDto })
  submit(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.submit(r, b);
  }
}
