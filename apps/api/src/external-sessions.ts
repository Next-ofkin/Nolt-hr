import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { Response } from "express";
import type { Prisma, User } from "@prisma/client";
import { ApiProperty } from "@nestjs/swagger";
import { Database } from "./database.js";
import type { AuthRequest } from "./sessions.js";
import { assertOrigin, cookie, digest, setCookie } from "./security.js";

export class ExternalSessionDto {
  @ApiProperty({ type: String }) requestId!: string;
  @ApiProperty({ type: String }) csrfToken!: string;
  @ApiProperty({ type: String }) expiresAt!: string;
}
@Injectable()
export class ExternalSessions {
  constructor(@Inject(Database) private db: Database) {}
  async issue(
    tx: Prisma.TransactionClient,
    user: User,
    requestId: string,
    requestExpiry: Date,
  ) {
    const token = randomBytes(32).toString("hex");
    const createdAt = new Date();
    const expiresAt = new Date(
      Math.min(createdAt.getTime() + 30 * 60_000, requestExpiry.getTime()),
    );
    await tx.externalEmailSession.create({
      data: {
        createdAt,
        tokenHash: digest(token),
        userId: user.id,
        requestId,
        authVersion: user.authVersion,
        expiresAt,
      },
    });
    return { token, expiresAt };
  }
  attach(res: Response, session: { token: string; expiresAt: Date }) {
    setCookie(
      res,
      "external",
      session.token,
      Math.max(0, session.expiresAt.getTime() - Date.now()),
    );
  }
  async authenticate(req: AuthRequest) {
    const token = cookie(req, "external");
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      throw new UnauthorizedException("Open your form invitation to continue.");
    const s = await this.db.externalEmailSession.findUnique({
      where: { tokenHash: digest(token) },
      include: { user: true, request: true },
    });
    if (
      !s ||
      s.revokedAt ||
      s.expiresAt <= new Date() ||
      !s.user.active ||
      s.authVersion !== s.user.authVersion
    )
      throw new UnauthorizedException(
        "Your form session expired. Ask the employee for a new invitation.",
      );
    const r = s.request;
    if (
      r.revokedAt ||
      r.expiresAt <= new Date() ||
      !["ACTIVE", "SUBMITTED"].includes(r.state) ||
      r.respondentId !== s.userId ||
      r.email !== s.user.email.toLowerCase() ||
      r.createdBy === s.userId
    )
      throw new ForbiddenException(
        "This form request is unavailable or replaced.",
      );
    assertOrigin(req);
    const csrfToken = digest("external-csrf:" + token);
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers["x-csrf-token"] !== csrfToken
    )
      throw new ForbiddenException("Reload the form before trying again.");
    req.sessionId = s.id;
    req.sessionToken = token;
    req.externalRequestId = r.id;
    req.actor = {
      id: s.userId,
      email: s.user.email,
      name: s.user.name,
      role: "EXTERNAL",
      permissions: [],
      mfaVerified: false,
      authMethod: "SUPABASE_EMAIL_LINK",
      externalRequestId: r.id,
      expiresAt: s.expiresAt.toISOString(),
    };
    return { requestId: r.id, csrfToken, expiresAt: s.expiresAt.toISOString() };
  }
}
@Injectable()
export class ExternalSessionGuard implements CanActivate {
  constructor(@Inject(ExternalSessions) private sessions: ExternalSessions) {}
  async canActivate(context: ExecutionContext) {
    await this.sessions.authenticate(
      context.switchToHttp().getRequest<AuthRequest>(),
    );
    return true;
  }
}
