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
  UseGuards,
  Body,
  BadRequestException,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiProperty,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiServiceUnavailableResponse,
  ApiTooManyRequestsResponse,
} from "@nestjs/swagger";
import type { Request, Response } from "express";
import { z } from "zod";
import { Sessions, type AuthRequest } from "./sessions.js";
import { SupabaseAuth } from "./supabase-auth.js";
import { assertOrigin, clearCookie, digest, LoginLimiter } from "./security.js";
export type { AuthRequest, Actor } from "./sessions.js";
export class SessionDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) email!: string;
  @ApiProperty({ type: String }) role!: string;
  @ApiProperty({ type: [String] }) permissions!: string[];
  @ApiProperty({ type: String }) csrfToken!: string;
  @ApiProperty({ type: Boolean }) mfaVerified!: boolean;
  @ApiProperty({ type: String, enum: ["SUPABASE"] }) authMethod!: string;
  @ApiProperty({ type: String }) expiresAt!: string;
}
export class AuthConfigDto {
  @ApiProperty({ type: Boolean }) enabled!: boolean;
  @ApiProperty({ type: String }) provider!: string;
  @ApiProperty({ type: Boolean }) mfaRequired!: boolean;
}
export class AuthNextDto {
  @ApiProperty({ type: String }) next!: string;
  @ApiProperty({ type: String, required: false }) message?: string;
}
export class FlowDto {
  @ApiProperty({ type: String }) stage!: string;
  @ApiProperty({ type: String }) csrfToken!: string;
  @ApiProperty({ type: String }) factorId!: string;
  @ApiProperty({ type: String }) qrCode!: string;
  @ApiProperty({ type: String }) secret!: string;
}
export class EnrollDto {
  @ApiProperty({ type: String }) factorId!: string;
  @ApiProperty({ type: String }) qrCode!: string;
  @ApiProperty({ type: String }) secret!: string;
}
export class SignOutDto {
  @ApiProperty({ type: Boolean }) signedOut!: boolean;
}
export class AuthErrorDto {
  @ApiProperty({ type: String }) message!: string;
  @ApiProperty({ type: Number }) statusCode!: number;
}
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(Sessions) private sessions: Sessions) {}
  async canActivate(context: import("@nestjs/common").ExecutionContext) {
    await this.sessions.authenticate(
      context.switchToHttp().getRequest<AuthRequest>(),
    );
    return true;
  }
}
@Injectable()
export class HrGuard implements CanActivate {
  canActivate(context: import("@nestjs/common").ExecutionContext) {
    if (
      !context
        .switchToHttp()
        .getRequest<AuthRequest>()
        .actor?.permissions.includes("forms.manage")
    )
      throw new ForbiddenException(
        "HR form management permission is required.",
      );
    return true;
  }
}
/** Explicit system-owner guard for HR-account administration only. */
@Injectable()
export class DeveloperGuard implements CanActivate {
  canActivate(context: import("@nestjs/common").ExecutionContext) {
    const actor = context.switchToHttp().getRequest<AuthRequest>().actor;
    if (!actor?.permissions.includes("hr.accounts.manage"))
      throw new ForbiddenException("Developer account administration is required.");
    return true;
  }
}
const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
const password = z.string().min(12).max(128);
const credentials = z
  .object({ email, password: z.string().min(1).max(128) })
  .strict();
const signup = z
  .object({ email, password, name: z.string().trim().min(1).max(160) })
  .strict();
function body<T>(schema: z.ZodType<T>, value: unknown): T {
  const p = schema.safeParse(value);
  if (!p.success)
    throw new BadRequestException(
      "Check the entered details. Passwords must contain at least 12 characters.",
    );
  return p.data;
}
@ApiTags("Authentication")
@ApiUnauthorizedResponse({ type: AuthErrorDto })
@ApiBadRequestResponse({ type: AuthErrorDto })
@ApiForbiddenResponse({ type: AuthErrorDto })
@ApiServiceUnavailableResponse({ type: AuthErrorDto })
@ApiTooManyRequestsResponse({ type: AuthErrorDto })
@Controller("auth")
export class AuthController {
  private limiter = new LoginLimiter(30);
  constructor(
    @Inject(Sessions) private sessions: Sessions,
    @Inject(SupabaseAuth) private auth: SupabaseAuth,
  ) {}
  private protect(req: Request) {
    assertOrigin(req);
    this.limiter.take(req.socket.remoteAddress ?? "unknown");
  }
  @Get("config") @ApiOkResponse({ type: AuthConfigDto }) config() {
    return {
      enabled: this.auth.enabled(),
      provider: "supabase",
      mfaRequired: true,
    };
  }
  @Post("login")
  @ApiCreatedResponse({ type: AuthNextDto })
  @ApiBody({
    schema: {
      type: "object",
      required: ["email", "password"],
      properties: {
        email: { type: "string", format: "email" },
        password: { type: "string", maxLength: 128 },
      },
      additionalProperties: false,
    },
  })
  login(
    @Body() value: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.protect(req);
    const p = body(credentials, value);
    return this.auth.password(p.email, p.password, req, res);
  }
  @Post("signup")
  @ApiCreatedResponse({ type: AuthNextDto })
  @ApiBody({
    schema: {
      type: "object",
      required: ["email", "password", "name"],
      properties: {
        email: { type: "string", format: "email" },
        password: { type: "string", minLength: 12, maxLength: 128 },
        name: { type: "string", minLength: 1, maxLength: 160 },
      },
      additionalProperties: false,
    },
  })
  register(
    @Body() value: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.protect(req);
    return this.auth.email("EMAIL_SIGNUP", body(signup, value), req, res);
  }
  @Post("recovery")
  @ApiCreatedResponse({ type: AuthNextDto })
  @ApiBody({
    schema: {
      type: "object",
      required: ["email"],
      properties: { email: { type: "string", format: "email" } },
      additionalProperties: false,
    },
  })
  recovery(
    @Body() value: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.protect(req);
    return this.auth.email(
      "EMAIL_RECOVERY",
      body(z.object({ email }).strict(), value),
      req,
      res,
    );
  }
  @Get("flow") @ApiOkResponse({ type: FlowDto }) flow(@Req() req: Request) {
    return this.auth.status(req);
  }
  @Post("callback")
  @ApiCreatedResponse({ type: AuthNextDto })
  @ApiBody({
    schema: {
      type: "object",
      required: ["code"],
      properties: { code: { type: "string", maxLength: 2048 } },
      additionalProperties: false,
    },
  })
  callback(
    @Body() value: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.protect(req);
    return this.auth.callback(
      body(z.object({ code: z.string().min(1).max(2048) }).strict(), value)
        .code,
      req,
      res,
    );
  }
  @Post("mfa/enroll")
  @ApiCreatedResponse({ type: EnrollDto })
  enroll(@Req() req: Request) {
    this.protect(req);
    return this.auth.enroll(req);
  }
  @Post("mfa/verify")
  @ApiCreatedResponse({ type: AuthNextDto })
  @ApiBody({
    schema: {
      type: "object",
      required: ["factorId", "code"],
      properties: {
        factorId: { type: "string", format: "uuid" },
        code: { type: "string", pattern: "^[0-9]{6}$" },
      },
      additionalProperties: false,
    },
  })
  async verify(
    @Body() value: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.protect(req);
    const p = body(
      z
        .object({
          factorId: z.string().uuid(),
          code: z.string().regex(/^[0-9]{6}$/),
        })
        .strict(),
      value,
    );
    const result = await this.auth.verify(p.factorId, p.code, req);
    if ("invitation" in result && result.invitation)
      return { next: "invitation" };
    if (result.recovery) return { next: "password" };
    await this.sessions.issue(
      result.user,
      "SUPABASE",
      true,
      req,
      res,
      result.encrypted,
    );
    clearCookie(res, "flow");
    return { next: "workspace" };
  }
  @Post("password")
  @ApiCreatedResponse({ type: AuthNextDto })
  @ApiBody({
    schema: {
      type: "object",
      required: ["password"],
      properties: {
        password: { type: "string", minLength: 12, maxLength: 128 },
      },
      additionalProperties: false,
    },
  })
  reset(
    @Body() value: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.protect(req);
    return this.auth.reset(
      body(z.object({ password }).strict(), value).password,
      req,
      res,
    );
  }
  @Get("session")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("session")
  @ApiOkResponse({ type: SessionDto })
  session(@Req() req: AuthRequest): SessionDto {
    return { ...req.actor, csrfToken: digest("csrf:" + req.sessionToken) };
  }
  @Post("logout")
  @UseGuards(SessionGuard)
  @ApiCreatedResponse({ type: SignOutDto })
  logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    return this.sessions.revoke(req, res);
  }
  @Post("logout-all")
  @UseGuards(SessionGuard)
  @ApiCreatedResponse({ type: SignOutDto })
  logoutAll(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.sessions.revoke(req, res, true);
  }
}
