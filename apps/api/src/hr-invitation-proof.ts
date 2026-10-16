import { Injectable, Inject, ForbiddenException, UnauthorizedException, ServiceUnavailableException } from "@nestjs/common";
import { SupabaseAuth } from "./supabase-auth.js";
import { Database } from "./database.js";
import { canAcceptHrInvitation, type HrInvitationStatus } from "./hr-invitation-rules.js";

export type HrProviderTokens = { access_token: string; refresh_token: string };

/**
 * Read-only identity proof. This does not activate an invitation or alter any User.
 * It must be called only after a valid invitation is located, and the final
 * transaction must recheck all conditions under a row lock.
 */
@Injectable()
export class HrInvitationProofService {
  constructor(
    @Inject(SupabaseAuth) private readonly auth: SupabaseAuth,
    @Inject(Database) private readonly db: Database,
  ) {}

  async verify(invitation: {
    state: string;
    email: string;
    expiresAt: Date | null;
    revokedAt: Date | null;
  }, tokens: HrProviderTokens) {
    if (!["SENT", "UNCERTAIN"].includes(invitation.state) ||
        !invitation.expiresAt || invitation.expiresAt <= new Date() ||
        invitation.revokedAt)
      throw new ForbiddenException("This HR invitation is no longer available.");

    const { client, session, user } = await this.auth.authenticated(tokens, AbortSignal.timeout(12000));
    const claims = await client.auth.getClaims(session.access_token);
    if (claims.error) throw new UnauthorizedException("Provider verification failed.");
    const subject = claims.data?.claims.sub;
    const level = claims.data?.claims.aal;
    const sessionId = claims.data?.claims.session_id;
    if (typeof sessionId !== "string" || !/^[a-f0-9-]{36}$/i.test(sessionId))
      throw new UnauthorizedException("Verified provider session is required.");
    const validity = await this.db.$queryRaw<{ active: boolean }[]>`SELECT nolt_private.auth_session_active(${user.id}::uuid,${sessionId}::uuid) AS active`;
    if (!validity[0]?.active) throw new UnauthorizedException("Provider session is revoked.");

    const email = user.email?.trim().toLowerCase() ?? null;
    const [existing, assignedEmployee, identity] = await Promise.all([
      this.db.user.findUnique({ where: { email: invitation.email }, select: { id: true, role: true, active: true } }),
      this.db.employee.findUnique({ where: { email: invitation.email }, select: { id: true } }),
      this.db.identity.findFirst({ where: { subject: user.id }, select: { userId: true } }),
    ]);
    // The auth trigger currently creates a provisional EMPLOYEE user for newly
    // invited identities; reject any preexisting identity not equal to this subject.
    if (!existing || existing.id !== user.id || !identity || identity.userId !== user.id)
      throw new ForbiddenException("This HR invitation cannot be linked to the verified account.");
    if (existing.role !== "EMPLOYEE" || !existing.active || assignedEmployee)
      throw new ForbiddenException("An existing account or employee profile cannot be promoted.");
    const allowed = canAcceptHrInvitation({
      state: invitation.state as HrInvitationStatus,
      inviteEmail: invitation.email,
      confirmedEmail: email,
      providerSubject: subject ?? null,
      hasExistingAccount: false,
      emailVerified: Boolean(user.email_confirmed_at),
      mfaVerified: user.factors?.some(f => f.factor_type === "totp" && f.status === "verified") ?? false,
      assuranceLevel: level ?? null,
      expired: invitation.expiresAt <= new Date(),
      revoked: Boolean(invitation.revokedAt),
    });
    if (!allowed || subject !== user.id)
      throw new UnauthorizedException("Verified email and MFA are required.");
    // An earlier account with the same subject cannot be distinguished from a
    // fresh invite using these fields alone: no caller may promote on this proof.
    return { subject: user.id, email, assuranceLevel: "aal2" as const, activationAllowed: false as const };
  }
}
