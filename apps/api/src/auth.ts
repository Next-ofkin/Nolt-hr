import {
  CanActivate,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Injectable,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiProperty,
  ApiTags,
  ApiCreatedResponse,
  ApiOkResponse,
} from "@nestjs/swagger";
import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { Database } from "./database.js";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export type Actor = { id: string; email: string; name: string; role: string };
export type AuthRequest = Request & { actor: Actor };
export class SessionDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) email!: string;
  @ApiProperty({ type: String }) role!: string;
  @ApiProperty({ type: String }) csrfToken!: string;
}
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(Database) private readonly db: Database) {}
  async canActivate(context: import("@nestjs/common").ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const token = req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("nolt_session="))
      ?.slice(13);
    if (!token) throw new UnauthorizedException("Sign in to continue.");
    const session = await this.db.session.findUnique({
      where: { tokenHash: hash(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt < new Date() || !session.user.active)
      throw new UnauthorizedException("Your session has expired.");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const csrf = req.headers["x-csrf-token"];
      if (typeof csrf !== "string" || hash(csrf) !== session.csrfHash)
        throw new ForbiddenException("Invalid request verification token.");
    }
    req.actor = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
    };
    return true;
  }
}
@Injectable()
export class HrGuard implements CanActivate {
  canActivate(context: import("@nestjs/common").ExecutionContext) {
    if (context.switchToHttp().getRequest<AuthRequest>().actor?.role !== "HR")
      throw new ForbiddenException(
        "HR form management permission is required.",
      );
    return true;
  }
}
@ApiTags("Local development identity")
@Controller("auth")
export class AuthController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @Get("session")
  @UseGuards(SessionGuard)
  @ApiOkResponse({ type: SessionDto })
  session(@Req() req: AuthRequest): SessionDto {
    const token = req.headers
      .cookie!.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("nolt_session="))!
      .slice(13);
    return { ...req.actor, csrfToken: hash("csrf:" + token) };
  }
  @Post("local-session")
  @ApiCreatedResponse({ type: SessionDto })
  @ApiOperation({
    summary: "Create synthetic localhost session; unavailable in production",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: { role: { type: "string", enum: ["HR", "EMPLOYEE"] } },
      required: ["role"],
      additionalProperties: false,
    },
  })
  async localSession(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionDto> {
    if (
      process.env.LOCAL_DEVELOPMENT !== "true" ||
      process.env.NODE_ENV === "production" ||
      !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
        req.socket.remoteAddress ?? "",
      )
    )
      throw new ForbiddenException("Local identity is disabled.");
    if (
      req.headers.origin &&
      !["http://127.0.0.1:3000", "http://localhost:3000"].includes(
        req.headers.origin,
      )
    )
      throw new ForbiddenException("Untrusted origin.");
    if (req.headers["sec-fetch-site"] === "cross-site")
      throw new ForbiddenException("Untrusted site.");
    const role = req.body?.role;
    if (!["HR", "EMPLOYEE"].includes(role))
      throw new ForbiddenException("Unknown synthetic role.");
    const user = await this.db.user.findUnique({
      where: {
        email: role === "HR" ? "hr@example.test" : "employee@example.test",
      },
    });
    if (!user || !user.active)
      throw new UnauthorizedException("Run the synthetic database seed first.");
    const token = randomBytes(32).toString("hex"),
      csrfToken = hash("csrf:" + token);
    await this.db.session.create({
      data: {
        tokenHash: hash(token),
        csrfHash: hash(csrfToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
      },
    });
    res.cookie("nolt_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 4 * 60 * 60 * 1000,
      path: "/",
    });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      csrfToken,
    };
  }
}
