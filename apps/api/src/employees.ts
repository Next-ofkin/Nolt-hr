import {
  BadRequestException,
  Body,
  CanActivate,
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
  Put,
  Query,
  Req,
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
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  type SchemaObject,
} from "@nestjs/swagger";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { Database } from "./database.js";
import { AuthErrorDto, SessionGuard, type AuthRequest } from "./auth.js";
import { dto as formDto, FormDto } from "./forms.js";
const text = (max: number) => z.string().trim().min(1).max(max);
const date = z.iso.date();
const fields = z
  .object({
    fullName: text(160),
    jobTitle: text(120),
    department: text(120),
    employmentType: text(80),
    startDate: date,
    employeeNumber: z
      .string()
      .trim()
      .max(50)
      .transform((v) => v.toUpperCase() || null)
      .nullable()
      .optional()
      .default(null),
  })
  .strict();
export const employeeCreateSchema = fields
  .extend({
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
  })
  .strict();
export const employeeUpdateSchema = z
  .object({ expectedRevision: z.number().int().positive(), profile: fields })
  .strict();
const revision = z
  .object({ expectedRevision: z.number().int().positive() })
  .strict();
const assignSchema = revision
  .extend({
    formVersionId: z.string().uuid(),
    required: z.boolean(),
    dueDate: date.nullable().optional().default(null),
  })
  .strict();
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const p = schema.safeParse(input);
  if (!p.success)
    throw new BadRequestException(
      p.error.issues.map((i) => i.message).join(" "),
    );
  return p.data;
}
const openapi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, {
    target: "openapi-3.0",
    io: "input",
  }) as SchemaObject;
const asDate = (v: string) => new Date(v + "T00:00:00.000Z");
export class EmployeeDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String, nullable: true }) userId!: string | null;
  @ApiProperty({ type: String, nullable: true }) employeeNumber!: string | null;
  @ApiProperty({ type: String }) fullName!: string;
  @ApiProperty({ type: String }) email!: string;
  @ApiProperty({ type: String }) jobTitle!: string;
  @ApiProperty({ type: String }) department!: string;
  @ApiProperty({ type: String }) employmentType!: string;
  @ApiProperty({ type: String, format: "date" }) startDate!: string;
  @ApiProperty({ type: Number }) revision!: number;
  @ApiProperty({ type: String }) createdAt!: string;
}
export class AssignmentDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) formId!: string;
  @ApiProperty({ type: String }) formVersionId!: string;
  @ApiProperty({ type: String }) title!: string;
  @ApiProperty({ type: Number }) version!: number;
  @ApiProperty({ type: String }) recipient!: string;
  @ApiProperty({ type: Boolean }) required!: boolean;
  @ApiProperty({ type: String, nullable: true, format: "date" }) dueDate!:
    string | null;
  @ApiProperty({ type: String }) status!: string;
}
export class CaseDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) employeeId!: string;
  @ApiProperty({ type: String }) status!: string;
  @ApiProperty({ type: String }) stage!: string;
  @ApiProperty({ type: Number }) revision!: number;
  @ApiProperty({ type: String }) createdAt!: string;
  @ApiProperty({ type: [AssignmentDto] }) assignments!: AssignmentDto[];
}
export class EmployeeDetailDto {
  @ApiProperty({ type: EmployeeDto }) employee!: EmployeeDto;
  @ApiProperty({ type: CaseDto, nullable: true })
  onboardingCase!: CaseDto | null;
}
export class EmployeePageDto {
  @ApiProperty({ type: [EmployeeDto] }) items!: EmployeeDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class PublishedVersionsDto {
  @ApiProperty({ type: [FormDto] }) items!: FormDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class MyOnboardingDto {
  @ApiProperty({ type: EmployeeDto, nullable: true })
  employee!: EmployeeDto | null;
  @ApiProperty({ type: CaseDto, nullable: true })
  onboardingCase!: CaseDto | null;
}
const employeeDto = (e: import("@prisma/client").Employee): EmployeeDto => ({
  id: e.id,
  userId: e.userId,
  employeeNumber: e.employeeNumber,
  fullName: e.fullName,
  email: e.email,
  jobTitle: e.jobTitle,
  department: e.department,
  employmentType: e.employmentType,
  startDate: e.startDate.toISOString().slice(0, 10),
  revision: e.revision,
  createdAt: e.createdAt.toISOString(),
});
const caseInclude = {
  assignments: {
    orderBy: { createdAt: "asc" as const },
    include: { formVersion: true, response: { select: { status: true } },
      externalRequests: { where: { state: "SUBMITTED" }, select: { id: true }, take: 1 } },
  },
};
type CaseRow = Prisma.OnboardingCaseGetPayload<{ include: typeof caseInclude }>;
const caseDto = (c: CaseRow): CaseDto => ({
  id: c.id,
  employeeId: c.employeeId,
  status: c.status,
  stage: c.stage,
  revision: c.revision,
  createdAt: c.createdAt.toISOString(),
  assignments: c.assignments.map((a) => ({
    id: a.id,
    formId: a.formId,
    formVersionId: a.formVersionId,
    title: a.formVersion.title,
    version: a.formVersion.version,
    recipient: a.formVersion.recipient,
    required: a.required,
    dueDate: a.dueDate?.toISOString().slice(0, 10) ?? null,
    status: a.formVersion.recipient !== "EMPLOYEE" && a.externalRequests.length > 0
      ? "EXTERNAL_SUBMITTED" : a.response?.status ?? "NOT_STARTED",
  })),
});
@Injectable()
export class EmployeesGuard implements CanActivate {
  canActivate(c: import("@nestjs/common").ExecutionContext) {
    if (
      !c
        .switchToHttp()
        .getRequest<AuthRequest>()
        .actor?.permissions.includes("employees.manage")
    )
      throw new ForbiddenException(
        "HR employee management permission is required.",
      );
    return true;
  }
}
@Injectable()
export class EmployeesService {
  constructor(@Inject(Database) private db: Database) {}
  async audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    action: string,
    targetId: string,
    metadata: Prisma.InputJsonValue = {},
  ) {
    await tx.auditEvent.create({
      data: { actorId, action, targetId, metadata },
    });
    await tx.outboxEvent.create({ data: { type: action, targetId } });
  }
  async conflict<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      )
        throw new ConflictException(
          "This employee, active case or assigned form already exists.",
        );
      throw e;
    }
  }
  async list(query: unknown): Promise<EmployeePageDto> {
    const q = parse(
      z
        .object({
          q: z.string().trim().max(100).optional(),
          caseStatus: z.enum(["ACTIVE", "CLOSED", "NONE"]).optional(),
          department: z.string().trim().max(120).optional(),
          employmentType: z.string().trim().max(80).optional(),
          startFrom: date.optional(),
          startTo: date.optional(),
          cursor: z.string().uuid().optional(),
          limit: z.coerce.number().int().min(1).max(50).default(25),
        })
        .strict(),
      query,
    );
    if (q.startFrom && q.startTo && q.startFrom > q.startTo)
      throw new BadRequestException("Start-date range is reversed.");
    const rows = await this.db.employee.findMany({
      where: {
        ...(q.caseStatus
          ? {
              cases:
                q.caseStatus === "NONE"
                  ? { none: {} }
                  : { some: { status: q.caseStatus } },
            }
          : {}),
        ...(q.q
          ? {
              OR: [
                { fullName: { contains: q.q, mode: "insensitive" as const } },
                { email: { contains: q.q, mode: "insensitive" as const } },
                {
                  employeeNumber: {
                    contains: q.q,
                    mode: "insensitive" as const,
                  },
                },
              ],
            }
          : {}),
        ...(q.department
          ? {
              department: {
                equals: q.department,
                mode: "insensitive" as const,
              },
            }
          : {}),
        ...(q.employmentType
          ? {
              employmentType: {
                equals: q.employmentType,
                mode: "insensitive" as const,
              },
            }
          : {}),
        ...(q.startFrom || q.startTo
          ? {
              startDate: {
                ...(q.startFrom ? { gte: asDate(q.startFrom) } : {}),
                ...(q.startTo ? { lte: asDate(q.startTo) } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    return {
      items: rows.slice(0, q.limit).map(employeeDto),
      nextCursor: rows.length > q.limit ? rows[q.limit - 1].id : null,
    };
  }
  async detail(id: string): Promise<EmployeeDetailDto> {
    const e = await this.db.employee.findUnique({ where: { id } });
    if (!e) throw new NotFoundException("Employee not found.");
    const c = await this.db.onboardingCase.findFirst({
      where: { employeeId: id, status: "ACTIVE" },
      include: caseInclude,
    });
    return { employee: employeeDto(e), onboardingCase: c ? caseDto(c) : null };
  }
  async create(actorId: string, input: unknown): Promise<EmployeeDetailDto> {
    const p = parse(employeeCreateSchema, input);
    return this.conflict(() =>
      this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${p.email},2026101305))`;
          const user = await tx.$queryRaw<
            { id: string | null }[]
          >`SELECT nolt_private.confirmed_employee_user(${p.email}) AS id`;
          const e = await tx.employee.create({
            data: {
              ...p,
              startDate: asDate(p.startDate),
              userId: user[0]?.id ?? null,
              createdBy: actorId,
            },
          });
          await this.audit(tx, actorId, "EMPLOYEE_CREATED", e.id);
          return { employee: employeeDto(e), onboardingCase: null };
        },
        { timeout: 15000 },
      ),
    );
  }
  async update(
    actorId: string,
    id: string,
    input: unknown,
  ): Promise<EmployeeDetailDto> {
    const p = parse(employeeUpdateSchema, input);
    await this.conflict(() =>
      this.db.$transaction(async (tx) => {
        const count = await tx.employee.updateMany({
          where: { id, revision: p.expectedRevision },
          data: {
            ...p.profile,
            startDate: asDate(p.profile.startDate),
            revision: { increment: 1 },
          },
        });
        if (count.count !== 1)
          throw new ConflictException(
            "Employee details changed. Reload before saving.",
          );
        await this.audit(tx, actorId, "EMPLOYEE_UPDATED", id, {
          revision: p.expectedRevision + 1,
        });
      }),
    );
    return this.detail(id);
  }
  async openCase(
    actorId: string,
    id: string,
    input: unknown,
  ): Promise<EmployeeDetailDto> {
    const p = parse(revision, input);
    await this.conflict(() =>
      this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM public."Employee" WHERE id=${id}::uuid FOR UPDATE`;
          const e = await tx.employee.findUnique({ where: { id } });
          if (!e) throw new NotFoundException();
          if (e.revision !== p.expectedRevision)
            throw new ConflictException(
              "Employee details changed. Reload first.",
            );
          if (
            await tx.onboardingCase.findFirst({
              where: { employeeId: id, status: "ACTIVE" },
            })
          )
            throw new ConflictException(
              "This employee already has an active onboarding case.",
            );
          const c = await tx.onboardingCase.create({
            data: { employeeId: id, createdBy: actorId },
          });
          await this.audit(tx, actorId, "ONBOARDING_CASE_OPENED", c.id, {
            employeeId: id,
          });
        },
        { timeout: 15000 },
      ),
    );
    return this.detail(id);
  }
  async assign(
    actorId: string,
    caseId: string,
    input: unknown,
  ): Promise<CaseDto> {
    const p = parse(assignSchema, input);
    return this.conflict(() =>
      this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM public."OnboardingCase" WHERE id=${caseId}::uuid FOR UPDATE`;
          const c = await tx.onboardingCase.findUnique({
            where: { id: caseId },
          });
          if (!c) throw new NotFoundException();
          if (c.status !== "ACTIVE" || c.revision !== p.expectedRevision)
            throw new ConflictException(
              "The case changed or is closed. Reload first.",
            );
          // Serialize assignment with unpublishing of this version.
          await tx.$queryRaw`SELECT id FROM public."FormVersion" WHERE id=${p.formVersionId}::uuid FOR UPDATE`;
          const v = await tx.formVersion.findUnique({
            where: { id: p.formVersionId },
          });
          if (!v || v.status !== "PUBLISHED")
            throw new BadRequestException("Select a published form version.");
          const a = await tx.formAssignment.create({
            data: {
              caseId,
              formId: v.formId,
              formVersionId: v.id,
              required: p.required,
              dueDate: p.dueDate ? asDate(p.dueDate) : null,
              assignedBy: actorId,
            },
          });
          await tx.onboardingCase.update({
            where: { id: caseId },
            data: { revision: { increment: 1 } },
          });
          await this.audit(tx, actorId, "FORM_ASSIGNED", a.id, {
            caseId,
            formVersionId: v.id,
            recipient: v.recipient,
          });
          return caseDto(
            await tx.onboardingCase.findUniqueOrThrow({
              where: { id: caseId },
              include: caseInclude,
            }),
          );
        },
        { timeout: 15000 },
      ),
    );
  }
  async published(query: unknown): Promise<PublishedVersionsDto> {
    const q = parse(
      z
        .object({
          q: z.string().trim().max(100).optional(),
          cursor: z.string().uuid().optional(),
        })
        .strict(),
      query,
    );
    const rows = await this.db.formVersion.findMany({
      where: {
        status: "PUBLISHED",
        ...(q.q
          ? { title: { contains: q.q, mode: "insensitive" as const } }
          : {}),
      },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: 26,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    return {
      items: rows.slice(0, 25).map(formDto),
      nextCursor: rows.length > 25 ? rows[24].id : null,
    };
  }
  async own(userId: string): Promise<MyOnboardingDto> {
    const e = await this.db.employee.findUnique({ where: { userId } });
    if (!e) return { employee: null, onboardingCase: null };
    return this.detail(e.id);
  }
  async ownForm(userId: string, id: string): Promise<FormDto> {
    const a = await this.db.formAssignment.findFirst({
      where: { id, onboardingCase: { employee: { userId }, status: "ACTIVE" } },
      include: { formVersion: true },
    });
    if (!a) throw new NotFoundException("Assigned form not found.");
    if (a.formVersion.recipient !== "EMPLOYEE")
      throw new ForbiddenException(
        "This form must be completed by the guarantor or reference, not by the employee.",
      );
    return formDto(a.formVersion);
  }
}
@ApiTags("HR employees")
@ApiBadRequestResponse({ type: AuthErrorDto })
@ApiUnauthorizedResponse({ type: AuthErrorDto })
@ApiForbiddenResponse({ type: AuthErrorDto })
@ApiNotFoundResponse({ type: AuthErrorDto })
@ApiConflictResponse({ type: AuthErrorDto })
@UseGuards(SessionGuard, EmployeesGuard)
@Controller()
export class EmployeesController {
  constructor(@Inject(EmployeesService) private service: EmployeesService) {}
  @Get("employees")
  @ApiOkResponse({ type: EmployeePageDto })
  @ApiQuery({
    name: "caseStatus",
    required: false,
    enum: ["ACTIVE", "CLOSED", "NONE"],
  })
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiQuery({ name: "department", required: false, type: String })
  @ApiQuery({ name: "employmentType", required: false, type: String })
  @ApiQuery({ name: "startFrom", required: false, type: String })
  @ApiQuery({ name: "startTo", required: false, type: String })
  @ApiQuery({ name: "cursor", required: false, type: String })
  @ApiQuery({ name: "limit", required: false, type: Number })
  list(@Query() q: unknown) {
    return this.service.list(q);
  }
  @Get("employees/:id") @ApiOkResponse({ type: EmployeeDetailDto }) detail(
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.detail(id);
  }
  @Post("employees")
  @ApiBody({ schema: openapi(employeeCreateSchema) })
  @ApiCreatedResponse({ type: EmployeeDetailDto })
  create(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.create(r.actor.id, b);
  }
  @Put("employees/:id")
  @ApiBody({ schema: openapi(employeeUpdateSchema) })
  @ApiOkResponse({ type: EmployeeDetailDto })
  update(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() b: unknown,
  ) {
    return this.service.update(r.actor.id, id, b);
  }
  @Post("employees/:id/onboarding-cases")
  @ApiBody({ schema: openapi(revision) })
  @ApiCreatedResponse({ type: EmployeeDetailDto })
  open(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() b: unknown,
  ) {
    return this.service.openCase(r.actor.id, id, b);
  }
  @Post("onboarding-cases/:id/assignments")
  @ApiBody({ schema: openapi(assignSchema) })
  @ApiCreatedResponse({ type: CaseDto })
  assign(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() b: unknown,
  ) {
    return this.service.assign(r.actor.id, id, b);
  }
  @Get("published-form-versions")
  @ApiOkResponse({ type: PublishedVersionsDto })
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiQuery({ name: "cursor", required: false, type: String })
  published(@Query() q: unknown) {
    return this.service.published(q);
  }
}
@ApiTags("Own onboarding")
@ApiUnauthorizedResponse({ type: AuthErrorDto })
@ApiForbiddenResponse({ type: AuthErrorDto })
@ApiNotFoundResponse({ type: AuthErrorDto })
@UseGuards(SessionGuard)
@Controller("me")
export class MyOnboardingController {
  constructor(@Inject(EmployeesService) private service: EmployeesService) {}
  private own(r: AuthRequest) {
    if (!r.actor.permissions.includes("profile.own"))
      throw new ForbiddenException("An employee account is required.");
  }
  @Get("onboarding") @ApiOkResponse({ type: MyOnboardingDto }) onboarding(
    @Req() r: AuthRequest,
  ) {
    this.own(r);
    return this.service.own(r.actor.id);
  }
  @Get("assignments/:id") @ApiOkResponse({ type: FormDto }) form(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    this.own(r);
    return this.service.ownForm(r.actor.id, id);
  }
}
