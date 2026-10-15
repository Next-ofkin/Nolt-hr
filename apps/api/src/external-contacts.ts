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
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
  ApiUnauthorizedResponse,
  type SchemaObject,
} from "@nestjs/swagger";
import { z } from "zod";
import { Database } from "./database.js";
import { AuthErrorDto, SessionGuard, type AuthRequest } from "./auth.js";

export const externalContactSchema = z
  .object({
    expectedRevision: z.number().int().min(0),
    fullName: z.string().trim().min(1).max(160),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
  })
  .strict();

export class ExternalContactDto {
  @ApiProperty({ type: String }) assignmentId!: string;
  @ApiProperty({ type: String, nullable: true }) fullName!: string | null;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: Number }) revision!: number;
  @ApiProperty({ type: String, enum: ["NOT_SENT"] }) status!: "NOT_SENT";
}

@Injectable()
export class ExternalContactsService {
  constructor(@Inject(Database) private db: Database) {}
  private async assignment(
    tx: import("@prisma/client").Prisma.TransactionClient,
    userId: string,
    id: string,
  ) {
    const a = await tx.formAssignment.findFirst({
      where: {
        id,
        onboardingCase: {
          status: "ACTIVE",
          employee: { userId, user: { active: true } },
        },
      },
      include: {
        formVersion: true,
        onboardingCase: { include: { employee: true } },
      },
    });
    if (!a) throw new NotFoundException("Assigned form not found.");
    if (!["GUARANTOR", "REFERENCE"].includes(a.formVersion.recipient))
      throw new ForbiddenException(
        "Only HR-designated guarantor or reference forms accept recipient details.",
      );
    return a;
  }
  private async result(
    tx: import("@prisma/client").Prisma.TransactionClient,
    id: string,
  ): Promise<ExternalContactDto> {
    const d = await tx.externalContactDraft.findUnique({
      where: { assignmentId: id },
    });
    return {
      assignmentId: id,
      fullName: d?.fullName ?? null,
      email: d?.email ?? null,
      revision: d?.revision ?? 0,
      status: "NOT_SENT",
    };
  }
  async get(userId: string, id: string) {
    return this.db.$transaction(async (tx) => {
      await this.assignment(tx, userId, id);
      return this.result(tx, id);
    });
  }
  async save(userId: string, id: string, input: unknown) {
    const p = externalContactSchema.safeParse(input);
    if (!p.success)
      throw new BadRequestException(
        "Enter a valid recipient name, email and revision.",
      );
    return this.db.$transaction(
      async (tx) => {
        // Match case-lock ordering used by response and review mutations.
        await tx.$queryRaw`SELECT c.id FROM public."OnboardingCase" c JOIN public."FormAssignment" a ON a."caseId"=c.id WHERE a.id=${id}::uuid FOR UPDATE OF c`;
        const a = await this.assignment(tx, userId, id);
        const actor = await tx.user.findUnique({ where: { id: userId } });
        if (
          p.data.email === a.onboardingCase.employee.email.toLowerCase() ||
          p.data.email === actor?.email.toLowerCase()
        )
          throw new BadRequestException(
            "Your guarantor or reference must use their own email address.",
          );
        const current = await tx.externalContactDraft.findUnique({
          where: { assignmentId: id },
        });
        if ((current?.revision ?? 0) !== p.data.expectedRevision)
          throw new ConflictException(
            "Recipient details changed. Reload before saving.",
          );
        const { expectedRevision, ...contact } = p.data;
        await tx.externalContactDraft.upsert({
          where: { assignmentId: id },
          create: { assignmentId: id, ...contact, updatedBy: userId },
          update: { ...contact, updatedBy: userId, revision: { increment: 1 } },
        });
        await tx.auditEvent.create({
          data: {
            actorId: userId,
            action: "EXTERNAL_CONTACT_SAVED",
            targetId: id,
            metadata: { revision: expectedRevision + 1 },
          },
        });
        // Notification-free domain event: this must not dispatch an invitation.
        await tx.outboxEvent.create({
          data: { type: "EXTERNAL_CONTACT_SAVED", targetId: id },
        });
        return this.result(tx, id);
      },
      { timeout: 15000, maxWait: 10000 },
    );
  }
}

@ApiTags("Own external recipient details")
@ApiBadRequestResponse({ type: AuthErrorDto })
@ApiUnauthorizedResponse({ type: AuthErrorDto })
@ApiForbiddenResponse({ type: AuthErrorDto })
@ApiNotFoundResponse({ type: AuthErrorDto })
@ApiConflictResponse({ type: AuthErrorDto })
@UseGuards(SessionGuard)
@Controller("me/assignments/:id/external-contact")
export class ExternalContactsController {
  constructor(
    @Inject(ExternalContactsService) private service: ExternalContactsService,
  ) {}
  private own(r: AuthRequest) {
    if (!r.actor.permissions.includes("profile.own"))
      throw new ForbiddenException("An employee account is required.");
  }
  @Get()
  @ApiOkResponse({ type: ExternalContactDto })
  get(@Req() r: AuthRequest, @Param("id", ParseUUIDPipe) id: string) {
    this.own(r);
    return this.service.get(r.actor.id, id);
  }
  @Put()
  @ApiBody({
    schema: z.toJSONSchema(externalContactSchema, {
      target: "openapi-3.0",
      io: "input",
    }) as SchemaObject,
  })
  @ApiOkResponse({ type: ExternalContactDto })
  save(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() b: unknown,
  ) {
    this.own(r);
    return this.service.save(r.actor.id, id, b);
  }
}
