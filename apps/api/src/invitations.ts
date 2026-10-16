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
  Req,
  Res,
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
import { createClient } from "@supabase/supabase-js";
import type {
  EmployeeInvitation,
  InvitationDelivery,
  Prisma,
} from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";
import { Database } from "./database.js";
import {
  AuthErrorDto,
  AuthNextDto,
  SessionGuard,
  type AuthRequest,
} from "./auth.js";
import { EmployeesGuard } from "./employees.js";
import { Sessions } from "./sessions.js";
import { SupabaseAuth } from "./supabase-auth.js";
import {
  appOrigin,
  assertOrigin,
  clearCookie,
  digest,
  LoginLimiter,
} from "./security.js";
const enqueueSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    requestKey: z.string().uuid(),
    replaceInvitationId: z.string().uuid().optional(),
  })
  .strict();
const token = z.string().min(1).max(16000);
const exchangeSchema = z
  .object({
    invitationId: z.string().uuid(),
    proof: z.union([
      z.object({ access_token: token, refresh_token: token }).strict(),
      z
        .object({ tokenHash: token, type: z.enum(["invite", "magiclink"]) })
        .strict(),
    ]),
  })
  .strict();
const completeSchema = z
  .object({ password: z.string().min(12).max(128).optional() })
  .strict();
function parse<T>(schema: z.ZodType<T>, input: unknown) {
  const p = schema.safeParse(input);
  if (!p.success)
    throw new BadRequestException("Check the invitation request fields.");
  return p.data;
}
const schema = (s: z.ZodType) =>
  z.toJSONSchema(s, { target: "openapi-3.0", io: "input" }) as SchemaObject;
const current = ["QUEUED", "SENDING", "SENT", "UNCERTAIN"];
export class InvitationDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) employeeId!: string;
  @ApiProperty({ type: String }) state!: string;
  @ApiProperty({ type: String }) createdAt!: string;
  @ApiProperty({ type: String }) expiresAt!: string;
  @ApiProperty({ type: String, nullable: true }) sentAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) acceptedAt!: string | null;
  @ApiProperty({ type: Number }) attempts!: number;
  @ApiProperty({ type: String, nullable: true }) errorCode!: string | null;
}
export class InvitationListDto {
  @ApiProperty({ type: [InvitationDto] }) items!: InvitationDto[];
}
export class InvitationActivationDto {
  @ApiProperty({ type: String }) employeeName!: string;
  @ApiProperty({ type: String }) email!: string;
  @ApiProperty({ type: Boolean }) requiresPassword!: boolean;
}
type Row = EmployeeInvitation & { delivery: InvitationDelivery | null };
const dto = (i: Row): InvitationDto => ({
  id: i.id,
  employeeId: i.employeeId,
  state:
    current.includes(i.state) && i.expiresAt <= new Date()
      ? "EXPIRED"
      : i.state,
  createdAt: i.createdAt.toISOString(),
  expiresAt: i.expiresAt.toISOString(),
  sentAt: i.sentAt?.toISOString() ?? null,
  acceptedAt: i.acceptedAt?.toISOString() ?? null,
  attempts: i.delivery?.attempts ?? 0,
  errorCode: i.delivery?.errorCode ?? null,
});
@Injectable()
export class InvitationsService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(SupabaseAuth) private auth: SupabaseAuth,
    @Inject(Sessions) private sessions: Sessions,
  ) {}
  transaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    options: { timeout?: number; maxWait?: number } = {},
  ) {
    return this.db.$transaction(work, {
      timeout: 15000,
      maxWait: 10000,
      ...options,
    });
  }
  async event(
    tx: Prisma.TransactionClient,
    actorId: string,
    action: string,
    id: string,
  ) {
    await tx.auditEvent.create({ data: { actorId, action, targetId: id } });
    return tx.outboxEvent.create({ data: { type: action, targetId: id } });
  }
  async list(employeeId: string) {
    if (
      !(await this.db.employee.findUnique({
        where: { id: employeeId },
        select: { id: true },
      }))
    )
      throw new NotFoundException();
    return {
      items: (
        await this.db.employeeInvitation.findMany({
          where: { employeeId },
          include: { delivery: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 10,
        })
      ).map(dto),
    };
  }
  async enqueue(actorId: string, employeeId: string, input: unknown) {
    const p = parse(enqueueSchema, input),
      requestHash = digest(JSON.stringify(p));
    const result = await this.transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM public."Employee" WHERE id=${employeeId}::uuid FOR UPDATE`;
        const employee = await tx.employee.findUnique({
          where: { id: employeeId },
        });
        if (!employee) throw new NotFoundException();
        const prior = await tx.employeeInvitation.findUnique({
          where: {
            employeeId_requestKey: { employeeId, requestKey: p.requestKey },
          },
          include: { delivery: true },
        });
        if (prior) {
          if (prior.requestHash !== requestHash)
            throw new ConflictException(
              "This request key was used for a different invitation request.",
            );
          return dto(prior);
        }
        if (employee.revision !== p.expectedRevision)
          throw new ConflictException("The employee changed. Reload first.");
        const account = await tx.user.findUnique({
          where: { email: employee.email },
        });
        if (account && (!account.active || account.role !== "EMPLOYEE"))
          throw new BadRequestException(
            "Invitations require an active employee account, not an HR or administrator account.",
          );
        if (
          !(await tx.onboardingCase.findFirst({
            where: { employeeId, status: "ACTIVE" },
          }))
        )
          throw new BadRequestException(
            "Open an onboarding case before inviting this employee.",
          );
        if (
          await tx.employeeInvitation.findFirst({
            where: { employeeId, state: "ACCEPTED" },
          })
        )
          throw new ConflictException(
            "This employee already activated their invitation.",
          );
        const existing = await tx.employeeInvitation.findFirst({
          where: { employeeId, state: { in: current } },
        });
        if (
          existing &&
          existing.expiresAt > new Date() &&
          p.replaceInvitationId !== existing.id
        )
          throw new ConflictException(
            "An invitation already exists. Use resend to replace it.",
          );
        if (p.replaceInvitationId) {
          const replaced = await tx.employeeInvitation.findFirst({
            where: { id: p.replaceInvitationId, employeeId },
          });
          if (!replaced || ![...current, "FAILED"].includes(replaced.state))
            throw new ConflictException("This invitation cannot be replaced.");
        }
        const old = await tx.employeeInvitation.findMany({
          where: { employeeId, state: { in: [...current, "FAILED"] } },
          select: { id: true },
        });
        for (const i of old) {
          await tx.employeeInvitation.update({
            where: { id: i.id },
            data: { state: "REVOKED", revokedAt: new Date() },
          });
          await tx.invitationDelivery.updateMany({
            where: { invitationId: i.id, state: { not: "SENT" } },
            data: { state: "CANCELLED", leaseUntil: null },
          });
          await this.event(tx, actorId, "INVITATION_REPLACED", i.id);
        }
        const minutes = Number(process.env.INVITATION_TTL_MINUTES ?? 60);
        if (!Number.isInteger(minutes) || minutes < 5 || minutes > 60)
          throw new BadRequestException(
            "Invitation expiry configuration is invalid.",
          );
        const passwordState = await tx.$queryRaw<
          { required: boolean }[]
        >`SELECT nolt_private.employee_password_required(${employee.email}) AS required`;
        const invitation = await tx.employeeInvitation.create({
          data: {
            employeeId,
            requestKey: p.requestKey,
            requestHash,
            requiresPassword: passwordState[0].required,
            createdBy: actorId,
            expiresAt: new Date(Date.now() + minutes * 60000),
          },
        });
        const outbox = await this.event(
          tx,
          actorId,
          "INVITATION_REQUESTED",
          invitation.id,
        );
        await tx.invitationDelivery.create({
          data: { invitationId: invitation.id, outboxId: outbox.id },
        });
        return dto(
          await tx.employeeInvitation.findUniqueOrThrow({
            where: { id: invitation.id },
            include: { delivery: true },
          }),
        );
      },
      { timeout: 15000 },
    );
    setImmediate(() => {
      void this.deliverNext(result.id).catch(() => {});
    });
    return result;
  }
  async revoke(actorId: string, id: string) {
    return this.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM public."EmployeeInvitation" WHERE id=${id}::uuid FOR UPDATE`;
      const i = await tx.employeeInvitation.findUnique({
        where: { id },
        include: { delivery: true },
      });
      if (!i) throw new NotFoundException();
      if (i.state === "ACCEPTED")
        throw new ConflictException(
          "Activation is complete. Account deactivation is a separate action.",
        );
      if (i.state !== "REVOKED") {
        await tx.employeeInvitation.update({
          where: { id },
          data: { state: "REVOKED", revokedAt: new Date() },
        });
        await tx.invitationDelivery.updateMany({
          where: { invitationId: id, state: { not: "SENT" } },
          data: { state: "CANCELLED", leaseUntil: null },
        });
        await this.event(tx, actorId, "INVITATION_REVOKED", id);
      }
      return dto({ ...i, state: "REVOKED" });
    });
  }
  valid(i: EmployeeInvitation | null) {
    if (
      !i ||
      !["SENT", "UNCERTAIN"].includes(i.state) ||
      i.expiresAt <= new Date() ||
      i.revokedAt
    )
      throw new ForbiddenException(
        "This invitation is unavailable, expired or replaced. Ask HR for a new invitation.",
      );
    return i;
  }
  async exchange(input: unknown, req: Request, res: Response) {
    const p = parse(exchangeSchema, input);
    const i = this.valid(
      await this.db.employeeInvitation.findUnique({
        where: { id: p.invitationId },
      }),
    );
    const employee = await this.db.employee.findUniqueOrThrow({
      where: { id: i.employeeId },
    });
    let tokens;
    if ("tokenHash" in p.proof) {
      const { client } = this.auth.client();
      const r = await client.auth.verifyOtp({
        token_hash: p.proof.tokenHash,
        type: p.proof.type,
      });
      if (r.error || !r.data.session)
        throw new ForbiddenException(
          "The email link is invalid or already used.",
        );
      tokens = this.auth.tokens(r.data.session);
    } else tokens = p.proof;
    const checked = await this.auth.authenticated(tokens);
    if (checked.user.email?.toLowerCase() !== employee.email)
      throw new ForbiddenException(
        "This invitation belongs to a different verified email.",
      );
    const member = await this.auth.member(checked.user.id);
    const linked = await this.db.employee.findUniqueOrThrow({
      where: { id: employee.id },
    });
    if (member.role !== "EMPLOYEE" || linked.userId !== member.id)
      throw new ForbiddenException(
        "This invitation is not linked to your employee account.",
      );
    this.valid(
      await this.db.employeeInvitation.findUnique({ where: { id: i.id } }),
    );
    return this.auth.start(
      "INVITATION",
      { tokens: this.auth.tokens(checked.session), invitationId: i.id },
      req,
      res,
      Math.min(600000, i.expiresAt.getTime() - Date.now()),
    );
  }
  async activation(req: Request) {
    const f = await this.auth.flow(req);
    if (f.row.kind !== "INVITATION" || !f.state.invitationId)
      throw new ForbiddenException("Open your invitation email first.");
    const i = this.valid(
      await this.db.employeeInvitation.findUnique({
        where: { id: f.state.invitationId },
      }),
    );
    const e = await this.db.employee.findUniqueOrThrow({
      where: { id: i.employeeId },
    });
    return {
      employeeName: e.fullName,
      email: e.email,
      requiresPassword: i.requiresPassword,
    };
  }
  async complete(input: unknown, req: Request, res: Response) {
    const p = parse(completeSchema, input),
      f = await this.auth.flow(req, true);
    if (f.row.kind !== "INVITATION" || !f.state.invitationId)
      throw new ForbiddenException("Open your invitation email first.");
    const i = this.valid(
      await this.db.employeeInvitation.findUnique({
        where: { id: f.state.invitationId },
      }),
    );
    let checked = await this.auth.validate(f.row.encryptedState);
    const employee = await this.db.employee.findUniqueOrThrow({
      where: { id: i.employeeId },
    });
    if (
      employee.userId !== checked.user.id ||
      employee.email !== checked.user.email ||
      checked.user.role !== "EMPLOYEE"
    )
      throw new ForbiddenException(
        "This invitation belongs to a different employee.",
      );
    if (i.requiresPassword) {
      if (!p.password)
        throw new BadRequestException(
          "Choose a password of at least 12 characters.",
        );
      const { client } = await this.auth.authenticated(f.state.tokens);
      const r = await client.auth.updateUser({ password: p.password });
      if (r.error)
        throw new BadRequestException(
          "Could not set your password. Choose a different strong password and try again.",
        );
      const session = await client.auth.getSession();
      if (!session.data.session) throw new ForbiddenException();
      checked = await this.auth.validate(
        (await import("./auth-crypto.js")).seal({
          tokens: this.auth.tokens(session.data.session),
        }),
      );
    }
    await this.transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM public."EmployeeInvitation" WHERE id=${i.id}::uuid FOR UPDATE`;
        this.valid(
          await tx.employeeInvitation.findUnique({ where: { id: i.id } }),
        );
        const e = await tx.employee.findUniqueOrThrow({
          where: { id: i.employeeId },
        });
        if (
          e.userId !== checked.user.id ||
          !(await tx.onboardingCase.findFirst({
            where: { employeeId: e.id, status: "ACTIVE" },
          }))
        )
          throw new ConflictException(
            "The employee's onboarding case changed. Contact HR.",
          );
        const consumed = await tx.authFlow.deleteMany({
          where: { id: f.row.id, encryptedState: f.row.encryptedState },
        });
        if (consumed.count !== 1)
          throw new ConflictException("This activation was already used.");
        await tx.employeeInvitation.update({
          where: { id: i.id },
          data: {
            state: "ACCEPTED",
            acceptedAt: new Date(),
            acceptedBy: checked.user.id,
          },
        });
        await this.event(tx, checked.user.id, "INVITATION_ACCEPTED", i.id);
        await this.sessions.issue(
          checked.user,
          "SUPABASE",
          true,
          req,
          res,
          checked.encrypted,
          tx,
        );
      },
      { timeout: 15000 },
    );
    clearCookie(res, "flow");
    return { next: "workspace" };
  }
  // Claim briefly; never hold a database transaction open during the provider email call.
  async deliverNext(onlyInvitationId?: string) {
    const expired = await this.db.invitationDelivery.findMany({
      where: { state: "SENDING", leaseUntil: { lt: new Date() } },
      take: 20,
    });
    for (const j of expired)
      await this.transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM public."EmployeeInvitation" WHERE id=${j.invitationId}::uuid FOR UPDATE`;
        const c = await tx.invitationDelivery.updateMany({
          where: { id: j.id, state: "SENDING", leaseUntil: { lt: new Date() } },
          data: {
            state: "UNCERTAIN",
            leaseUntil: null,
            errorCode: "DELIVERY_UNCERTAIN",
          },
        });
        if (c.count) {
          await tx.employeeInvitation.updateMany({
            where: { id: j.invitationId, state: "SENDING" },
            data: { state: "UNCERTAIN" },
          });
          const i = await tx.employeeInvitation.findUniqueOrThrow({
            where: { id: j.invitationId },
          });
          await this.event(
            tx,
            i.createdBy,
            "INVITATION_DELIVERY_UNCERTAIN",
            i.id,
          );
          await tx.outboxEvent.update({
            where: { id: j.outboxId },
            data: { processedAt: new Date() },
          });
        }
      });
    const job = await this.transaction(async (tx) => {
      const ids = await tx.$queryRaw<
        { id: string }[]
      >`SELECT j.id FROM public."InvitationDelivery" j JOIN public."EmployeeInvitation" i ON i.id=j."invitationId" WHERE j.state='PENDING' AND j."availableAt"<=now() AND (${onlyInvitationId ?? null}::uuid IS NULL OR i.id=${onlyInvitationId ?? null}::uuid) ORDER BY j."availableAt",j.id FOR UPDATE OF i SKIP LOCKED LIMIT 1`;
      if (!ids.length) return null;
      const j = await tx.invitationDelivery.findUniqueOrThrow({
        where: { id: ids[0].id },
        include: { invitation: { include: { employee: true } } },
      });
      const i = j.invitation;
      if (i.revokedAt || i.expiresAt <= new Date() || i.state !== "QUEUED") {
        await tx.invitationDelivery.update({
          where: { id: j.id },
          data: { state: "CANCELLED" },
        });
        await tx.employeeInvitation.updateMany({
          where: { id: i.id, state: "QUEUED" },
          data: { state: "EXPIRED" },
        });
        await tx.outboxEvent.update({
          where: { id: j.outboxId },
          data: { processedAt: new Date() },
        });
        return null;
      }
      await tx.invitationDelivery.update({
        where: { id: j.id },
        data: {
          state: "SENDING",
          attempts: { increment: 1 },
          leaseUntil: new Date(Date.now() + 90000),
        },
      });
      await tx.employeeInvitation.update({
        where: { id: i.id },
        data: { state: "SENDING" },
      });
      return j;
    });
    if (!job) return false;
    const filter = process.env.INVITATION_TEST_RECIPIENTS;
    const allowed =
      filter !== undefined
        ? filter
            .split(",")
            .map((v) => v.trim().toLowerCase())
            .filter(Boolean)
        : null;
    let code: string | null = null,
      uncertain = false,
      retry = false;
    if (
      allowed &&
      !allowed.includes(job.invitation.employee.email.toLowerCase())
    )
      code = "RECIPIENT_NOT_APPROVED";
    else if (!process.env.SUPABASE_SECRET_KEY) code = "SENDER_NOT_CONFIGURED";
    else
      try {
        const redirectTo =
          appOrigin() + "/invitations/accept?id=" + job.invitation.id;
        const client = createClient(
          process.env.SUPABASE_URL!,
          !job.invitation.employee.userId
            ? process.env.SUPABASE_SECRET_KEY!
            : process.env.SUPABASE_PUBLISHABLE_KEY!,
          {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
              flowType: "implicit",
            },
            global: {
              fetch: (url, init) =>
                fetch(url, { ...init, signal: AbortSignal.timeout(25000) }),
            },
          },
        );
        const result = !job.invitation.employee.userId
          ? await client.auth.admin.inviteUserByEmail(
              job.invitation.employee.email,
              { redirectTo },
            )
          : await client.auth.signInWithOtp({
              email: job.invitation.employee.email,
              options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
            });
        if (result.error) {
          code = /^[a-z0-9_]+$/i.test(result.error.code ?? "")
            ? result.error.code!
            : "PROVIDER_REJECTED";
          retry = result.error.status === 429;
          uncertain = !result.error.status || result.error.status >= 500;
        }
      } catch {
        code = "DELIVERY_UNCERTAIN";
        uncertain = true;
      }
    await this.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM public."EmployeeInvitation" WHERE id=${job.invitationId}::uuid FOR UPDATE`;
      const i = await tx.employeeInvitation.findUniqueOrThrow({
        where: { id: job.invitationId },
      });
      const pending =
        retry &&
        job.attempts + 1 < 5 &&
        i.expiresAt.getTime() > Date.now() + 60000;
      const state = code
        ? uncertain
          ? "UNCERTAIN"
          : pending
            ? "QUEUED"
            : "FAILED"
        : "SENT";
      await tx.invitationDelivery.update({
        where: { id: job.id },
        data: {
          state:
            i.state !== "SENDING"
              ? "CANCELLED"
              : state === "QUEUED"
                ? "PENDING"
                : state,
          leaseUntil: null,
          errorCode: code,
          availableAt: new Date(
            Date.now() + Math.min(900, 60 * 2 ** job.attempts) * 1000,
          ),
        },
      });
      if (i.state === "SENDING") {
        await tx.employeeInvitation.update({
          where: { id: i.id },
          data: { state, ...(!code ? { sentAt: new Date() } : {}) },
        });
        await this.event(
          tx,
          i.createdBy,
          code ? "INVITATION_DELIVERY_FAILED" : "INVITATION_SENT",
          i.id,
        );
      }
      if (!pending)
        await tx.outboxEvent.update({
          where: { id: job.outboxId },
          data: { processedAt: new Date() },
        });
    });
    return true;
  }
}
@ApiTags("HR invitations")
@ApiBadRequestResponse({ type: AuthErrorDto })
@ApiUnauthorizedResponse({ type: AuthErrorDto })
@ApiForbiddenResponse({ type: AuthErrorDto })
@ApiNotFoundResponse({ type: AuthErrorDto })
@ApiConflictResponse({ type: AuthErrorDto })
@UseGuards(SessionGuard, EmployeesGuard)
@Controller()
export class InvitationsController {
  constructor(
    @Inject(InvitationsService) private service: InvitationsService,
  ) {}
  @Get("employees/:id/invitations")
  @ApiOkResponse({ type: InvitationListDto })
  list(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.list(id);
  }
  @Post("employees/:id/invitations")
  @ApiBody({ schema: schema(enqueueSchema) })
  @ApiCreatedResponse({ type: InvitationDto })
  enqueue(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() b: unknown,
  ) {
    return this.service.enqueue(r.actor.id, id, b);
  }
  @Post("invitations/:id/revoke")
  @ApiCreatedResponse({ type: InvitationDto })
  revoke(@Req() r: AuthRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.revoke(r.actor.id, id);
  }
}
@ApiTags("Invitation activation")
@ApiBadRequestResponse({ type: AuthErrorDto })
@ApiUnauthorizedResponse({ type: AuthErrorDto })
@ApiForbiddenResponse({ type: AuthErrorDto })
@ApiConflictResponse({ type: AuthErrorDto })
@Controller("invitations")
export class InvitationActivationController {
  private limiter = new LoginLimiter(30);
  constructor(
    @Inject(InvitationsService) private service: InvitationsService,
  ) {}
  protect(req: Request) {
    assertOrigin(req);
    this.limiter.take(req.ip ?? "unknown");
  }
  @Post("exchange")
  @ApiBody({ schema: schema(exchangeSchema) })
  @ApiCreatedResponse({ type: AuthNextDto })
  exchange(
    @Req() r: Request,
    @Res({ passthrough: true }) s: Response,
    @Body() b: unknown,
  ) {
    this.protect(r);
    return this.service.exchange(b, r, s);
  }
  @Get("activation")
  @ApiOkResponse({ type: InvitationActivationDto })
  activation(@Req() r: Request) {
    this.protect(r);
    return this.service.activation(r);
  }
  @Post("activate")
  @ApiBody({ schema: schema(completeSchema) })
  @ApiCreatedResponse({ type: AuthNextDto })
  complete(
    @Req() r: Request,
    @Res({ passthrough: true }) s: Response,
    @Body() b: unknown,
  ) {
    this.protect(r);
    return this.service.complete(b, r, s);
  }
}
