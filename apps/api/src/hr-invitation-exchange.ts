import {
  BadRequestException, Body, Controller, ForbiddenException, Inject,
  Injectable, Post, Req, ServiceUnavailableException,
} from "@nestjs/common";
import { ApiCreatedResponse, ApiProperty, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { Database } from "./database.js";
import { SupabaseAuth } from "./supabase-auth.js";
import { assertOrigin, LoginLimiter } from "./security.js";

const token = z.string().min(1).max(16000);
const payload = z.object({
  invitationId: z.string().uuid(),
  proof: z.union([
    z.object({ access_token: token, refresh_token: token }).strict(),
    z.object({ tokenHash: token, type: z.enum(["invite", "magiclink"]) }).strict(),
  ]),
}).strict();

export class HrExchangeResultDto {
  @ApiProperty({ enum: ["awaiting_activation"] })
  next!: "awaiting_activation";
}

@Injectable()
export class HrInvitationExchangeService {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(SupabaseAuth) private readonly auth: SupabaseAuth,
  ) {}

  async exchange(input: unknown): Promise<HrExchangeResultDto> {
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
    return { next: "awaiting_activation" };
  }
}

@Controller("hr-invitations")
@ApiTags("HR invitations")
export class HrInvitationExchangeController {
  private readonly limiter = new LoginLimiter(20);
  constructor(@Inject(HrInvitationExchangeService) private readonly service: HrInvitationExchangeService) {}
  @Post("exchange")
  @ApiCreatedResponse({ type: HrExchangeResultDto })
  exchange(@Body() value: unknown, @Req() req: Request) {
    assertOrigin(req);
    this.limiter.take(req.socket.remoteAddress ?? "unknown");
    return this.service.exchange(value);
  }
}
