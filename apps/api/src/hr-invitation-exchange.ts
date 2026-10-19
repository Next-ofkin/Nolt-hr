import {
  BadRequestException, Body, Controller, ForbiddenException, Inject,
  Injectable, Get, Post, Req, Res, ServiceUnavailableException,
} from "@nestjs/common";
import { ApiCreatedResponse, ApiProperty, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { z } from "zod";
import { Database } from "./database.js";
import { SupabaseAuth } from "./supabase-auth.js";
import { HrInvitationProofService } from "./hr-invitation-proof.js";
import { assertOrigin, LoginLimiter } from "./security.js";
import { seal } from "./auth-crypto.js";

const token = z.string().min(1).max(16000);
const payload = z.object({
  invitationId: z.string().uuid(),
  proof: z.union([
    z.object({ access_token: token, refresh_token: token }).strict(),
    z.object({ tokenHash: token, type: z.enum(["invite", "magiclink"]) }).strict(),
  ]),
}).strict();

export class HrVerificationDto {
  @ApiProperty({ type: Boolean }) verified!: boolean;
  @ApiProperty({ type: Boolean }) activationAllowed!: boolean;
  @ApiProperty({ type: Boolean }) resuming!: boolean;
}

export class HrPasswordResultDto {
  @ApiProperty({ enum: ["awaiting_activation"] }) next!: "awaiting_activation";
}

export class HrExchangeResultDto {
  @ApiProperty({ enum: ["mfa"] })
  next!: "mfa";
}

@Injectable()
export class HrInvitationExchangeService {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(SupabaseAuth) private readonly auth: SupabaseAuth,
    @Inject(HrInvitationProofService) private readonly proof: HrInvitationProofService,
  ) {}

  async verification(req: Request): Promise<HrVerificationDto> {
    if (process.env.HR_INVITATION_ACCEPTANCE_ENABLED !== "true")
      throw new ServiceUnavailableException("HR invitation verification is not available yet.");
    const flow = await this.auth.flow(req);
    if (flow.row.kind !== "HR_INVITATION" || !flow.state.invitationId || !flow.state.tokens)
      throw new ForbiddenException("Open your HR invitation email first.");
    const invitation = await this.db.hrInvitation.findUnique({
      where: { id: flow.state.invitationId },
    });
    if (!invitation) throw new ForbiddenException("This HR invitation is unavailable.");
    await this.proof.verify(invitation, flow.state.tokens);
    return { verified: true, activationAllowed: false, resuming: flow.state.hrResume === true };
  }

  async activationReadiness(req: Request) {
    if (process.env.HR_INVITATION_ACCEPTANCE_ENABLED !== "true")
      throw new ServiceUnavailableException("HR invitation activation is not available yet.");
    const flow = await this.auth.flow(req, true);
    if (flow.row.kind !== "HR_INVITATION" || !flow.state.invitationId ||
        !flow.state.hrSubject || !flow.state.tokens ||
        flow.state.hrPasswordStatus !== "CONFIRMED" ||
        !flow.row.hrPasswordConfirmedAt ||
        flow.row.hrInvitationId !== flow.state.invitationId ||
        flow.row.hrSubject !== flow.state.hrSubject ||
        flow.row.hrPasswordConfirmedAt < flow.row.createdAt ||
        flow.row.hrPasswordConfirmedAt >= flow.row.expiresAt ||
        flow.row.hrPasswordConfirmedAt > new Date())
      throw new ForbiddenException("HR invitation activation prerequisites are incomplete.");
    const invitation = await this.db.hrInvitation.findUnique({
      where: { id: flow.state.invitationId },
    });
    if (!invitation) throw new ForbiddenException("This HR invitation is unavailable.");
    const verified = await this.proof.verify(invitation, flow.state.tokens);
    if (verified.subject !== flow.state.hrSubject || verified.email !== invitation.email)
      throw new ForbiddenException("The verified account does not match this invitation.");
    // This is a read-only readiness report, never an authorization grant.
    return { prerequisitesMet: true, activationAllowed: false };
  }

  async setPassword(input: unknown, req: Request) {
    if (process.env.HR_INVITATION_ACCEPTANCE_ENABLED !== "true")
      throw new ServiceUnavailableException("HR invitation activation is not available yet.");
    const parsed = z.object({ password: z.string().min(12).max(128) }).strict().safeParse(input);
    if (!parsed.success) throw new BadRequestException("Choose a password of 12 to 128 characters.");
    const flow = await this.auth.flow(req, true);
    if (flow.row.kind !== "HR_INVITATION" || !flow.state.invitationId || !flow.state.tokens ||
        flow.state.hrPasswordSet === true || flow.state.hrResume === true || flow.state.hrPasswordStatus !== undefined)
      throw new ForbiddenException("This HR password setup cannot be used.");
    const invitation = await this.db.hrInvitation.findUnique({ where: { id: flow.state.invitationId } });
    if (!invitation) throw new ForbiddenException("This HR invitation is unavailable.");
    const proof = await this.proof.verify(invitation, flow.state.tokens);
    const authenticated = await this.auth.authenticated(flow.state.tokens, AbortSignal.timeout(12000));
    if (authenticated.user.id !== proof.subject)
      throw new ForbiddenException("The verified account has changed.");
    // Claim the flow before the irreversible external password update.
    // Competing requests must never perform two provider-side changes.
    const claimedState = seal({ ...flow.state, hrPasswordStatus: "CLAIMED" as const });
    const claim = await this.db.authFlow.updateMany({
      where: { id: flow.row.id, encryptedState: flow.row.encryptedState, expiresAt: { gt: new Date() } },
      data: { encryptedState: claimedState },
    });
    if (claim.count !== 1) throw new ForbiddenException("This verification was already used.");
    const updated = await authenticated.client.auth.updateUser({ password: parsed.data.password });
    if (updated.error) throw new BadRequestException("Could not set this password. Try another strong password.");
    const session = await authenticated.client.auth.getSession();
    if (!session.data.session) throw new ForbiddenException("Sign in again to continue.");
    await this.proof.verify(invitation, this.auth.tokens(session.data.session));
    // The claimed flow cannot be replayed. Do not store refreshed tokens or
    // allow further password changes; activation remains separately disabled.
    const confirmed = await this.db.authFlow.updateMany({
      where: { id: flow.row.id, encryptedState: claimedState, expiresAt: { gt: new Date() } },
      data: { encryptedState: seal({ ...flow.state, tokens: this.auth.tokens(session.data.session), hrPasswordStatus: "CONFIRMED" as const }), hrPasswordConfirmedAt: new Date() },
    });
    if (confirmed.count !== 1) throw new ForbiddenException("Password confirmation failed.");
    return { next: "awaiting_activation" };
  }

  /** Reauthenticate an already invited account; never issue an application session. */
  async resume(input: unknown, req: Request, res: Response): Promise<HrExchangeResultDto> {
    if (process.env.HR_INVITATION_ACCEPTANCE_ENABLED !== "true")
      throw new ServiceUnavailableException("HR invitation verification is not available.");
    const parsed = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(128) }).strict().safeParse(input);
    if (!parsed.success) throw new BadRequestException("Enter your invitation email and existing password.");
    const email = parsed.data.email.trim().toLowerCase();
    const invitation = await this.db.hrInvitation.findFirst({
      where: { email, state: "SENT", expiresAt: { gt: new Date() }, revokedAt: null },
    });
    if (!invitation || !invitation.creationSubject || invitation.creationSubject !== invitation.providerSubject)
      throw new ForbiddenException("This HR invitation is unavailable.");
    // Expired AuthFlow records are disposable and may be deleted on next sign-in.
    // Current password authentication, exact invitation-created identity binding,
    // and a new live AAL2 challenge provide fresh evidence without relying on them.
    const { client } = this.auth.client();
    const result = await client.auth.signInWithPassword({ email, password: parsed.data.password });
    if (result.error || !result.data.session || !result.data.user?.email_confirmed_at ||
        result.data.user.id !== invitation.creationSubject)
      throw new ForbiddenException("Could not verify the invited account.");
    const account = await this.db.user.findUnique({ where: { id: result.data.user.id } });
    const employee = await this.db.employee.findFirst({
      where: { OR: [{ userId: result.data.user.id }, { email }] }, select: { id: true },
    });
    if (!account || !account.active || account.role !== "EMPLOYEE" || employee)
      throw new ForbiddenException("This account is not eligible for HR activation.");
    await this.auth.start("HR_INVITATION", {
      invitationId: invitation.id, hrSubject: result.data.user.id,
      hrResume: true, tokens: this.auth.tokens(result.data.session),
    }, req, res, Math.min(600000, invitation.expiresAt.getTime() - Date.now()));
    return { next: "mfa" };
  }

  /** Fresh password possession + current AAL2; records readiness only, NOT an HR grant. */
  async confirmResume(req: Request) {
    if (process.env.HR_INVITATION_ACCEPTANCE_ENABLED !== "true")
      throw new ServiceUnavailableException("HR verification is not available.");
    const flow = await this.auth.flow(req, true);
    if (flow.row.kind !== "HR_INVITATION" || flow.state.hrResume !== true ||
        flow.state.hrPasswordStatus !== undefined || !flow.state.invitationId ||
        !flow.state.hrSubject || !flow.state.tokens ||
        flow.row.hrInvitationId !== flow.state.invitationId ||
        flow.row.hrSubject !== flow.state.hrSubject)
      throw new ForbiddenException("This re-verification cannot be completed.");
    const invitation = await this.db.hrInvitation.findUnique({where: {id: flow.state.invitationId}});
    if (!invitation || invitation.state !== "SENT")
      throw new ForbiddenException("The invitation is no longer available.");
    const proof = await this.proof.verify(invitation, flow.state.tokens);
    if (proof.subject !== flow.state.hrSubject) throw new ForbiddenException("Account mismatch.");
    // This flow originated from a successful password sign-in and its fresh MFA
    // was checked against the same subject by proof.verify above. Do not treat
    // historical flow records as authoritative: they are routinely purged.
    const changed = await this.db.authFlow.updateMany({
      where: {id:flow.row.id,encryptedState:flow.row.encryptedState,expiresAt:{gt:new Date()},hrPasswordConfirmedAt:null},
      data: {encryptedState:seal({...flow.state,hrPasswordStatus:"CONFIRMED" as const}),hrPasswordConfirmedAt:new Date()},
    });
    if (changed.count !== 1) throw new ForbiddenException("Verification already completed or expired.");
    return {next:"awaiting_activation" as const};
  }

  async exchange(input: unknown, req: Request, res: Response): Promise<HrExchangeResultDto> {
    // This endpoint can check identity, but cannot grant access or create a
    // privileged flow until the HR-specific MFA and activation path is ready.
    if (process.env.HR_INVITATION_ACCEPTANCE_ENABLED !== "true")
      throw new ServiceUnavailableException("HR invitation activation is not available yet.");
    const parsed = payload.safeParse(input);
    if (!parsed.success) throw new BadRequestException("Invalid HR invitation link.");
    const invitation = await this.db.hrInvitation.findUnique({
      where: { id: parsed.data.invitationId },
    });
    if (!invitation || invitation.state !== "SENT" ||
        !invitation.expiresAt || invitation.expiresAt <= new Date() ||
        invitation.revokedAt || !invitation.providerSubject ||
        !invitation.creationSubject ||
        invitation.providerSubject !== invitation.creationSubject)
      throw new ForbiddenException("This HR invitation is unavailable.");

    let tokens;
    if ("tokenHash" in parsed.data.proof) {
      const { client } = this.auth.client();
      const result = await client.auth.verifyOtp({
        token_hash: parsed.data.proof.tokenHash, type: parsed.data.proof.type,
      });
      if (result.error || !result.data.session)
        throw new ForbiddenException("This HR invitation link is invalid or expired.");
      tokens = this.auth.tokens(result.data.session);
    } else tokens = parsed.data.proof;
    const verified = await this.auth.authenticated(tokens, AbortSignal.timeout(12000));
    if (verified.user.id !== invitation.creationSubject ||
        verified.user.email?.trim().toLowerCase() !== invitation.email)
      throw new ForbiddenException("This HR invitation belongs to a different account.");
    const account = await this.db.user.findUnique({ where: { id: verified.user.id } });
    const employee = await this.db.employee.findFirst({
      where: { OR: [{ userId: verified.user.id }, { email: invitation.email }] },
      select: { id: true },
    });
    if (!account || account.role !== "EMPLOYEE" || !account.active || employee)
      throw new ForbiddenException("This account is not eligible for HR invitation activation.");
    // Encrypted, short-lived HR-only flow. Never issue an application session here.
    await this.auth.start(
      "HR_INVITATION",
      { invitationId: invitation.id, hrSubject: verified.user.id, tokens: this.auth.tokens(verified.session) },
      req, res, Math.min(600000, invitation.expiresAt.getTime() - Date.now()),
    );
    return { next: "mfa" };
  }
}

@Controller("hr-invitations")
@ApiTags("HR invitations")
export class HrInvitationExchangeController {
  private readonly limiter = new LoginLimiter(20);
  constructor(@Inject(HrInvitationExchangeService) private readonly service: HrInvitationExchangeService) {}
  @Get("verification")
  verification(@Req() req: Request) {
    this.limiter.take(req.socket.remoteAddress ?? "unknown");
    return this.service.verification(req);
  }
  @Get("activation-readiness")
  activationReadiness(@Req() req: Request) {
    this.limiter.take(req.socket.remoteAddress ?? "unknown");
    return this.service.activationReadiness(req);
  }
  @Post("password")
  @ApiCreatedResponse({ type: HrPasswordResultDto })
  password(@Body() value: unknown, @Req() req: Request) {
    assertOrigin(req);
    this.limiter.take(req.socket.remoteAddress ?? "unknown");
    return this.service.setPassword(value, req);
  }
  @Post("resume")
  @ApiCreatedResponse({ type: HrExchangeResultDto })
  resume(@Body() value:unknown, @Req() req:Request, @Res({passthrough:true}) res:Response) {
    assertOrigin(req);
    this.limiter.take(req.socket.remoteAddress ?? "unknown");
    return this.service.resume(value,req,res);
  }
  @Post("resume-confirm")
  confirmResume(@Req() req:Request) {
    assertOrigin(req);
    this.limiter.take(req.socket.remoteAddress ?? "unknown");
    return this.service.confirmResume(req);
  }
  @Post("exchange")
  @ApiCreatedResponse({ type: HrExchangeResultDto })
  exchange(@Body() value: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    assertOrigin(req);
    this.limiter.take(req.socket.remoteAddress ?? "unknown");
    return this.service.exchange(value, req, res);
  }
}
