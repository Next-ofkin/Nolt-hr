import {
  Inject,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { randomBytes } from "node:crypto";
import type { User, Prisma } from "@prisma/client";
import { Database } from "./database.js";
import { SupabaseAuth } from "./supabase-auth.js";
import {
  assertOrigin,
  clearCookie,
  cookie,
  digest,
  localEnabled,
  permissionsFor,
  privileged,
  setCookie,
} from "./security.js";
export const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 30 * 60 * 1000;
// Older deployed APIs accept only 64 hex characters. They must reject scoped tokens.
export function newSessionToken(externalRequestId?: string) {
  return `${externalRequestId ? "external_" : ""}${randomBytes(32).toString("hex")}`;
}
export function sessionTokenMatchesScope(
  token: string,
  externalRequestId?: string | null,
) {
  return (
    /^(?:external_)?[a-f0-9]{64}$/.test(token) &&
    token.startsWith("external_") === Boolean(externalRequestId)
  );
}
export type Actor = {
  externalRequestId: string | null;
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  mfaVerified: boolean;
  authMethod: string;
  expiresAt: string;
};
export type AuthRequest = Request & {
  actor: Actor;
  sessionId: string;
  sessionToken: string;
  externalRequestId?: string | null;
};

const sessionRefreshChains = new Map<string, Promise<void>>();
/** Runs `work` after earlier work for the same session finishes (in-process only). */
export async function withSessionRefreshQueue<T>(
  sessionId: string,
  work: () => Promise<T>,
): Promise<T> {
  const previous = sessionRefreshChains.get(sessionId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const chain = previous.then(() => gate);
  sessionRefreshChains.set(sessionId, chain);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (sessionRefreshChains.get(sessionId) === chain)
      sessionRefreshChains.delete(sessionId);
  }
}
@Injectable()
export class Sessions {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(SupabaseAuth) private provider: SupabaseAuth,
  ) {}
  async issue(
    user: User,
    method: "SUPABASE",
    mfaVerified: boolean,
    req: Request,
    res: Response,
    providerSession: string,
    transaction?: Prisma.TransactionClient,
    externalRequestId?: string,
  ) {
    const token = newSessionToken(externalRequestId),
      csrfToken = digest("csrf:" + token),
      expiresAt = new Date(Date.now() + SESSION_ABSOLUTE_MS);
    const work = async (tx: Prisma.TransactionClient) => {
      const current = await tx.user.findUnique({ where: { id: user.id } });
      if (!current?.active || current.authVersion !== user.authVersion)
        throw new UnauthorizedException(
          "Account access changed. Sign in again.",
        );
      const old = cookie(req, "session");
      if (old)
        await tx.session.updateMany({
          where: { tokenHash: digest(old) },
          data: { revokedAt: new Date() },
        });
      await tx.session.create({
        data: {
          tokenHash: digest(token),
          csrfHash: digest(csrfToken),
          userId: user.id,
          authMethod: method,
          authVersion: user.authVersion,
          mfaVerified,
          providerSession,
          externalRequestId,
          expiresAt,
        },
      });
      await tx.outboxEvent.create({
        data: { type: "SESSION_CREATED", targetId: user.id },
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: "SESSION_CREATED",
          targetId: user.id,
          metadata: { method, mfaVerified },
        },
      });
    };
    if (transaction) await work(transaction);
    else await this.db.$transaction(work);
    setCookie(res, "session", token, SESSION_ABSOLUTE_MS);
    return {
      externalRequestId: externalRequestId ?? null,
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: externalRequestId ? [] : permissionsFor(user),
      authMethod: method,
      mfaVerified,
      expiresAt: expiresAt.toISOString(),
      csrfToken,
    };
  }
  async authenticate(req: AuthRequest) {
    const token = cookie(req, "session");
    if (!token || !/^(?:external_)?[a-f0-9]{64}$/.test(token))
      throw new UnauthorizedException("Sign in to continue.");
    const session = await this.db.session.findUnique({
      where: { tokenHash: digest(token) },
      include: { user: true },
    });
    const now = new Date();
    if (
      !session ||
      !sessionTokenMatchesScope(token, session.externalRequestId) ||
      session.revokedAt ||
      session.expiresAt <= now ||
      now.getTime() - session.lastSeenAt.getTime() > SESSION_IDLE_MS ||
      !session.user.active ||
      session.authVersion !== session.user.authVersion ||
      session.authMethod !== "SUPABASE" ||
      !session.providerSession
    )
      throw new UnauthorizedException(
        "Your session has expired or access was revoked.",
      );
    if (!session.mfaVerified)
      throw new UnauthorizedException("Multi-factor sign-in is required.");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      assertOrigin(req);
      const csrf = req.headers["x-csrf-token"];
      if (typeof csrf !== "string" || digest(csrf) !== session.csrfHash)
        throw new ForbiddenException("Invalid request verification token.");
    }
    // Check the provider outside the per-session row lock when the token has
    // ample lifetime left. All identity/MFA/provider-revocation checks still run.
    // Compare-and-swap the saved token snapshot so concurrent logout or refresh
    // cannot silently reuse a stale session.
    let verifiedWithoutLock = false;
    if (process.env.SESSION_FAST_AUTH !== "false" &&
        this.provider.canValidateWithoutSessionLock(session.providerSession)) {
      const proof = await this.provider.validate(session.providerSession);
      if (proof.user.id !== session.userId ||
          proof.user.authVersion !== session.authVersion)
        throw new UnauthorizedException("Account access changed. Sign in again.");
      {
        const unchanged = this.provider.providerTokensUnchanged(session.providerSession, proof.encrypted);
        const verifiedAt = new Date();
        const updated = await this.db.session.updateMany({
          where: {
            id: session.id,
            userId: session.userId,
            authVersion: session.authVersion,
            providerSession: session.providerSession,
            revokedAt: null,
            expiresAt: { gt: verifiedAt },
            lastSeenAt: { gt: new Date(verifiedAt.getTime() - SESSION_IDLE_MS) },
          },
          data: { lastSeenAt: verifiedAt, ...(!unchanged ? {providerSession:proof.encrypted} : {}) },
        });
        verifiedWithoutLock = updated.count === 1;
      }
    }
    // Slow path (token near expiry, or the fast-path compare-and-swap lost a race).
    // Refresh-token rotation must not run twice at once for one session, so requests
    // for the same session queue in this process. The queue is in memory: a database
    // row lock must never be held while we wait on Supabase (that caused 30s stalls).
    // The final write is a compare-and-swap, so a second API instance stays safe.
    if (!verifiedWithoutLock)
      await withSessionRefreshQueue(session.id, async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          const current = await this.db.session.findUnique({
            where: { id: session.id },
          });
          if (!current?.providerSession || current.revokedAt)
            throw new UnauthorizedException("Your session was revoked.");
          const provider = await this.provider.validate(current.providerSession);
          if (
            provider.user.id !== session.userId ||
            provider.user.authVersion !== session.authVersion
          )
            throw new UnauthorizedException(
              "Account access changed. Sign in again.",
            );
          const verifiedAt = new Date();
          const updated = await this.db.session.updateMany({
            where: {
              id: session.id,
              userId: session.userId,
              authVersion: session.authVersion,
              providerSession: current.providerSession,
              revokedAt: null,
              expiresAt: { gt: verifiedAt },
            },
            data: {
              lastSeenAt: verifiedAt,
              providerSession: provider.encrypted,
            },
          });
          if (updated.count === 1) return;
        }
        throw new ServiceUnavailableException(
          "Sign-in verification is temporarily unavailable. Please retry.",
        );
      });
    req.actor = {
      externalRequestId: session.externalRequestId,
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role,
      permissions: session.externalRequestId
        ? []
        : permissionsFor(session.user),
      authMethod: session.authMethod,
      mfaVerified: session.mfaVerified,
      expiresAt: session.expiresAt.toISOString(),
    };
    req.sessionId = session.id;
    req.externalRequestId = session.externalRequestId;
    req.sessionToken = token;
  }
  async revoke(req: AuthRequest, res: Response, all = false) {
    const current = await this.db.session.findUnique({
      where: { id: req.sessionId },
    });
    await this.db.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: all
          ? { userId: req.actor.id, revokedAt: null }
          : { id: req.sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (all)
        await tx.externalEmailSession.updateMany({
          where: { userId: req.actor.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await tx.outboxEvent.create({
        data: {
          type: all ? "ALL_SESSIONS_REVOKED" : "SESSION_REVOKED",
          targetId: req.actor.id,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: req.actor.id,
          action: all ? "ALL_SESSIONS_REVOKED" : "SESSION_REVOKED",
          targetId: req.actor.id,
        },
      });
    });
    clearCookie(res, "session");
    if (all) clearCookie(res, "external");
    if (current?.providerSession)
      await this.provider.signOut(current.providerSession, all);
    return { signedOut: true };
  }
}
