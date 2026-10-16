import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  createClient,
  type Session as ProviderSession,
} from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { Database } from "./database.js";
import { seal, unseal } from "./auth-crypto.js";
import {
  appOrigin,
  clearCookie,
  cookie,
  digest,
  setCookie,
} from "./security.js";

type Tokens = { access_token: string; refresh_token: string };
type FlowState = {
  externalRequestId?: string;
  invitationId?: string;
  hrPasswordSet?: boolean;
  hrPasswordStatus?: "CLAIMED" | "CONFIRMED";
  hrSubject?: string;
  tokens?: Tokens;
  storage?: Record<string, string>;
  factorId?: string;
  qrCode?: string;
  secret?: string;
};
const FLOW_MS = 10 * 60 * 1000;
@Injectable()
export class SupabaseAuth {
  constructor(@Inject(Database) private db: Database) {}
  enabled() {
    return (
      process.env.AUTH_PROVIDER === "supabase" &&
      !!process.env.SUPABASE_URL &&
      !!process.env.SUPABASE_PUBLISHABLE_KEY
    );
  }
  client(initial: Record<string, string> = {}, deadline?: AbortSignal) {
    if (!this.enabled())
      throw new ServiceUnavailableException(
        "Supabase sign-in is not configured.",
      );
    const values = new Map(Object.entries(initial));
    const client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        ...(deadline
          ? {
              global: {
                fetch: (url: RequestInfo | URL, init?: RequestInit) =>
                  fetch(url, {
                    ...init,
                    signal: init?.signal
                      ? AbortSignal.any([deadline, init.signal])
                      : deadline,
                  }),
              },
            }
          : {}),
        auth: {
          autoRefreshToken: false,
          persistSession: true,
          detectSessionInUrl: false,
          flowType: "pkce",
          storageKey: "nolt-provider",
          storage: {
            getItem: (k) => values.get(k) ?? null,
            setItem: (k, v) => {
              values.set(k, v);
            },
            removeItem: (k) => {
              values.delete(k);
            },
          },
        },
      },
    );
    return { client, values };
  }
  tokens(session: Tokens): Tokens {
    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    };
  }
  async start(
    kind: string,
    state: FlowState,
    req: Request,
    res: Response,
    ttl = FLOW_MS,
  ) {
    const token = randomBytes(32).toString("hex");
    const old = cookie(req, "flow");
    await this.db
      .$transaction(
        async (tx) => {
          await tx.authFlow.deleteMany({
            where: {
              OR: [
                { expiresAt: { lt: new Date() } },
                ...(old ? [{ tokenHash: digest(old) }] : []),
              ],
            },
          });
          await tx.authFlow.create({
            data: {
              tokenHash: digest(token),
              csrfHash: digest(digest("flow:" + token)),
              kind,
              hrInvitationId: kind === "HR_INVITATION" ? state.invitationId : undefined,
              hrSubject: kind === "HR_INVITATION" ? state.hrSubject : undefined,
              encryptedState: seal(state),
              expiresAt: new Date(Date.now() + ttl),
            },
          });
        },
        { timeout: 15000, maxWait: 10000 },
      )
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ["P2028", "P2024"].includes(error.code)
        )
          throw new ServiceUnavailableException(
            "Sign-in storage is temporarily unavailable. Please try again.",
          );
        throw error;
      });
    setCookie(res, "flow", token, ttl);
    return { next: kind.startsWith("EMAIL_") ? "email" : "mfa" };
  }
  async flow(req: Request, csrf = false) {
    const token = cookie(req, "flow");
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      throw new UnauthorizedException(
        "Sign in again to continue verification.",
      );
    const row = await this.db.authFlow.findUnique({
      where: { tokenHash: digest(token) },
    });
    if (!row || row.expiresAt <= new Date())
      throw new UnauthorizedException(
        "Verification expired. Sign in or request a new email.",
      );
    if (
      csrf &&
      (typeof req.headers["x-csrf-token"] !== "string" ||
        digest(req.headers["x-csrf-token"]) !== row.csrfHash)
    )
      throw new ForbiddenException("Invalid request verification token.");
    return {
      row,
      state: unseal<FlowState>(row.encryptedState),
      csrfToken: digest("flow:" + token),
    };
  }
  async email(
    kind: "EMAIL_SIGNUP" | "EMAIL_RECOVERY",
    input: { email: string; password?: string; name?: string },
    req: Request,
    res: Response,
  ) {
    const { client, values } = this.client();
    const redirectTo = appOrigin() + "/auth/callback";
    const result =
      kind === "EMAIL_SIGNUP"
        ? await client.auth.signUp({
            email: input.email,
            password: input.password!,
            options: {
              data: { name: input.name },
              emailRedirectTo: redirectTo,
            },
          })
        : await client.auth.resetPasswordForEmail(input.email, { redirectTo });
    if (result.error) {
      if (
        ["over_email_send_rate_limit", "over_request_rate_limit"].includes(
          result.error.code ?? "",
        )
      )
        throw new BadRequestException(
          "Please wait before requesting another email.",
        );
      throw new BadRequestException(
        "We could not send the email. Check your details or try again later.",
      );
    }
    // Require verified email; do not accept an immediate session when confirmation is disabled.
    await this.start(
      kind,
      { storage: Object.fromEntries(values) },
      req,
      res,
      45 * 60 * 1000,
    );
    return {
      next: "email",
      message:
        "If the address can be used, Supabase will send an email. Open it in this browser to continue.",
    };
  }
  async password(email: string, password: string, req: Request, res: Response) {
    const { client } = this.client();
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.session || !data.user?.email_confirmed_at)
      throw new UnauthorizedException(
        "Email or password is incorrect, or your email is not verified.",
      );
    await this.member(data.user.id);
    return this.start("MFA", { tokens: this.tokens(data.session) }, req, res);
  }
  async callback(code: string, req: Request, res: Response) {
    const { row, state } = await this.flow(req, true);
    if (
      !["EMAIL_SIGNUP", "EMAIL_RECOVERY"].includes(row.kind) ||
      !state.storage
    )
      throw new UnauthorizedException(
        "This email verification cannot be used here.",
      );
    const claimed = await this.db.authFlow.deleteMany({
      where: { id: row.id, encryptedState: row.encryptedState },
    });
    if (claimed.count !== 1)
      throw new UnauthorizedException("This verification was already used.");
    const { client } = this.client(state.storage);
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error || !data.session || !data.user?.email_confirmed_at)
      throw new UnauthorizedException(
        "This email link expired or was opened in another browser. Sign in or request a new recovery email.",
      );
    await this.member(data.user.id);
    return this.start(
      row.kind === "EMAIL_RECOVERY" ? "RECOVERY" : "MFA",
      { tokens: this.tokens(data.session) },
      req,
      res,
    );
  }
  async authenticated(tokens?: Tokens, deadline?: AbortSignal) {
    if (!tokens) throw new UnauthorizedException("Sign in again.");
    const { client } = this.client({}, deadline);
    const { data, error } = await client.auth.setSession(tokens);
    if (
      deadline?.aborted ||
      (error &&
        (error.name === "AuthRetryableFetchError" ||
          (error.status ?? 0) >= 500))
    )
      throw new ServiceUnavailableException(
        "Sign-in verification is temporarily unavailable. Please retry.",
      );
    if (error || !data.session)
      throw new UnauthorizedException(
        "Your Supabase session expired. Sign in again.",
      );
    // setSession performs an authoritative getUser call (or a refresh at Auth).
    // Do not duplicate that network validation.
    if (!data.user?.email_confirmed_at)
      throw new UnauthorizedException(
        "The account is unavailable or unverified.",
      );
    return { client, session: data.session, user: data.user };
  }
  async member(
    subject: string,
    database: Pick<Database, "identity" | "$queryRaw"> = this.db,
  ) {
    const identity = await database.identity.findUnique({
      where: {
        issuer_subject: {
          issuer: process.env.SUPABASE_URL! + "/auth/v1",
          subject,
        },
      },
      include: { user: true },
    });
    if (!identity?.user.active)
      throw new ForbiddenException(
        "Your account has not been provisioned or access is disabled. Contact HR.",
      );
    return identity.user;
  }
  private async replaceHrFlowSnapshot(row: { id: string; encryptedState: string; kind: string }, next: unknown) {
    const changed = await this.db.authFlow.updateMany({
      where: { id: row.id, kind: "HR_INVITATION", encryptedState: row.encryptedState, expiresAt: { gt: new Date() }, hrPasswordConfirmedAt: null },
      data: { encryptedState: seal(next) },
    });
    if (changed.count !== 1)
      throw new ForbiddenException("HR verification changed. Restart the invitation verification.");
  }
  async status(req: Request) {
    const { row, state, csrfToken } = await this.flow(req);
    if (row.kind.startsWith("EMAIL_"))
      return {
        stage: "email",
        csrfToken,
        factorId: "",
        qrCode: "",
        secret: "",
      };
    const auth = await this.authenticated(state.tokens);
    const { data, error } = await auth.client.auth.mfa.listFactors();
    if (error)
      throw new ServiceUnavailableException(
        "Could not load authenticator verification.",
      );
    const factor = data.totp[0];
    const assurance =
      await auth.client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (row.kind === "HR_INVITATION") {
      if (state.hrPasswordStatus || state.hrPasswordSet) {
        // The completed/claimed flow must not be overwritten by a stale MFA GET.
      } else {
        await this.replaceHrFlowSnapshot(row, { ...state, tokens: this.tokens(auth.session) });
      }
    } else {
    await this.db.authFlow.update({
      where: { id: row.id },
      data: {
        encryptedState: seal({ ...state, tokens: this.tokens(auth.session) }),
      },
    });
    }
    return {
      stage:
        row.kind === "HR_INVITATION" && assurance.data?.currentLevel === "aal2"
          ? "hr_invitation"
          : row.kind === "EXTERNAL" && assurance.data?.currentLevel === "aal2"
          ? "external"
          : row.kind === "INVITATION" && assurance.data?.currentLevel === "aal2"
            ? "invitation"
            : row.kind === "RECOVERY" && assurance.data?.currentLevel === "aal2"
              ? "password"
              : factor
                ? "challenge"
                : "enroll",
      csrfToken,
      factorId: factor?.id ?? state.factorId ?? "",
      qrCode: factor ? "" : (state.qrCode ?? ""),
      secret: factor ? "" : (state.secret ?? ""),
    };
  }
  async enroll(req: Request) {
    const { row, state } = await this.flow(req, true);
    if (!["MFA", "RECOVERY", "INVITATION", "EXTERNAL", "HR_INVITATION"].includes(row.kind))
      throw new ForbiddenException("Sign in before setting up MFA.");
    const { client, session } = await this.authenticated(state.tokens);
    const factors = await client.auth.mfa.listFactors();
    if (factors.error)
      throw new ServiceUnavailableException("Could not load authenticators.");
    if (factors.data.totp.length)
      throw new ForbiddenException(
        "Use your existing authenticator to sign in.",
      );
    if (state.factorId && state.qrCode)
      return {
        factorId: state.factorId,
        qrCode: state.qrCode,
        secret: state.secret ?? "",
      };
    // Clear incomplete enrolments owned by this authenticated account, never verified factors.
    for (const f of factors.data.all.filter(
      (f) => f.status === "unverified" && f.factor_type === "totp",
    ))
      await client.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "NOLT authenticator",
      issuer: "NOLT HR",
    });
    if (error || data.type !== "totp")
      throw new BadRequestException(
        "Could not set up your authenticator. Try again.",
      );
    const next = {
      ...state,
      tokens: this.tokens(session),
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    };
    if (row.kind === "HR_INVITATION") {
      if (state.hrPasswordStatus || state.hrPasswordSet)
        throw new ForbiddenException("HR password setup already started.");
      await this.replaceHrFlowSnapshot(row, next);
    } else {
    await this.db.authFlow.update({
      where: { id: row.id },
      data: { encryptedState: seal(next) },
    });
    }
    return {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    };
  }
  async verify(factorId: string, code: string, req: Request) {
    const { row, state } = await this.flow(req, true);
    if (!["MFA", "RECOVERY", "INVITATION", "EXTERNAL", "HR_INVITATION"].includes(row.kind))
      throw new ForbiddenException("Sign in before verifying MFA.");
    const { client } = await this.authenticated(state.tokens);
    const factors = await client.auth.mfa.listFactors();
    if (
      factors.error ||
      !factors.data.all.some(
        (f) => f.id === factorId && f.factor_type === "totp",
      )
    )
      throw new ForbiddenException("Unknown authenticator.");
    const { error } = await client.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });
    if (error)
      throw new UnauthorizedException(
        "That authenticator code is incorrect or expired.",
      );
    const { data } = await client.auth.getSession();
    if (!data.session) throw new UnauthorizedException("Sign in again.");
    const checked = await this.validate(seal(this.tokens(data.session)));
    if (row.kind === "INVITATION" || row.kind === "EXTERNAL" || row.kind === "HR_INVITATION") {
      if (row.kind === "HR_INVITATION") {
        if (state.hrPasswordStatus || state.hrPasswordSet)
          throw new ForbiddenException("HR password setup already started.");
        await this.replaceHrFlowSnapshot(row, { ...state, tokens: this.tokens(data.session) });
      } else {
      await this.db.authFlow.update({
        where: { id: row.id },
        data: {
          encryptedState: seal({ ...state, tokens: this.tokens(data.session) }),
        },
      });
      }
      return {
        invitation: row.kind === "INVITATION",
        hrInvitation: row.kind === "HR_INVITATION",
        external: row.kind === "EXTERNAL",
        recovery: false as const,
        user: checked.user,
        encrypted: checked.encrypted,
      };
    }
    if (row.kind === "RECOVERY") {
      await this.db.authFlow.update({
        where: { id: row.id },
        data: { encryptedState: checked.encrypted },
      });
      // Recovery flow remains MFA protected, and never creates a workspace session.
      return {
        recovery: true as const,
        rowId: row.id,
        user: checked.user,
        encrypted: checked.encrypted,
      };
    }
    const consumed = await this.db.authFlow.deleteMany({
      where: { id: row.id, encryptedState: row.encryptedState },
    });
    if (consumed.count !== 1)
      throw new UnauthorizedException(
        "This sign-in verification was already used.",
      );
    return {
      recovery: false as const,
      rowId: row.id,
      user: checked.user,
      encrypted: checked.encrypted,
    };
  }
  async validate(
    encrypted: string,
    database: Pick<Database, "identity" | "$queryRaw"> = this.db,
  ) {
    // Recovery stores the same state envelope as normal flows.
    const value = unseal<Tokens | FlowState>(encrypted);
    const tokens = "access_token" in value ? value : value.tokens;
    // Bound the complete provider proof round trip, leaving time for database checks.
    const deadline = AbortSignal.timeout(12000);
    const { client, session, user } = await this.authenticated(
      tokens,
      deadline,
    );
    const claims = await client.auth.getClaims(session.access_token);
    if (
      deadline.aborted ||
      (claims.error &&
        (claims.error.name === "AuthRetryableFetchError" ||
          (claims.error.status ?? 0) >= 500))
    )
      throw new ServiceUnavailableException(
        "Sign-in verification is temporarily unavailable. Please retry.",
      );
    if (
      claims.error ||
      claims.data?.claims.aal !== "aal2" ||
      claims.data.claims.sub !== user.id ||
      !user.factors?.some(
        (f) => f.factor_type === "totp" && f.status === "verified",
      )
    )
      throw new UnauthorizedException(
        "Authenticator verification is required.",
      );
    const sessionId = claims.data.claims.session_id;
    if (typeof sessionId !== "string" || !/^[a-f0-9-]{36}$/i.test(sessionId))
      throw new UnauthorizedException("Provider session is unavailable.");
    const active = await database.$queryRaw<
      { active: boolean }[]
    >`SELECT nolt_private.auth_session_active(${user.id}::uuid,${sessionId}::uuid) AS active`;
    if (!active[0]?.active)
      throw new UnauthorizedException(
        "Your Supabase session was revoked. Sign in again.",
      );
    const member = await this.member(user.id, database);
    return { user: member, encrypted: seal({ tokens: this.tokens(session) }) };
  }
  async reset(password: string, req: Request, res: Response) {
    const { row, state } = await this.flow(req, true);
    if (row.kind !== "RECOVERY")
      throw new ForbiddenException("Use a verified password recovery email.");
    const checked = await this.validate(row.encryptedState);
    const { client } = await this.authenticated(state.tokens);
    const { error } = await client.auth.updateUser({ password });
    if (error)
      throw new BadRequestException(
        "Could not update the password. Use a different strong password or request a new recovery email.",
      );
    await client.auth.signOut({ scope: "global" });
    await this.db.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: { userId: checked.user.id },
        data: { revokedAt: new Date() },
      });
      await tx.externalEmailSession.updateMany({
        where: { userId: checked.user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.authFlow.deleteMany({ where: { id: row.id } });
      await tx.auditEvent.create({
        data: {
          actorId: checked.user.id,
          action: "PASSWORD_RECOVERED",
          targetId: checked.user.id,
        },
      });
      await tx.outboxEvent.create({
        data: { type: "PASSWORD_RECOVERED", targetId: checked.user.id },
      });
    });
    clearCookie(res, "flow");
    clearCookie(res, "session");
    return { next: "login" };
  }
  async signOut(encrypted: string, all: boolean) {
    try {
      const v = unseal<FlowState>(encrypted);
      const { client } = await this.authenticated(v.tokens);
      await client.auth.signOut({ scope: all ? "global" : "local" });
    } catch {
      /* Local revocation is authoritative even if provider access has already expired. */
    }
  }
}
