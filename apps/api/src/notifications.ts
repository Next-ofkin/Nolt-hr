import { Controller, ForbiddenException, Get, Inject, Injectable, UseGuards, Req } from "@nestjs/common";
import { ApiOkResponse, ApiProperty, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { Database } from "./database.js";
import { AuthErrorDto, SessionGuard, type AuthRequest } from "./auth.js";
import {
  employeeNotices,
  hrNotices,
  sortNotices,
  type HrAssignment,
  type Notice,
  type NoticeAssignment,
} from "./notification-rules.js";

export class NoticeDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ enum: ["action", "late", "info"] }) kind!: string;
  @ApiProperty({ type: String }) title!: string;
  @ApiProperty({ type: String }) detail!: string;
  @ApiProperty({ type: String }) href!: string;
}
export class NotificationsDto {
  /** Lines that need doing (late + action). "info" lines are shown but not counted. */
  @ApiProperty({ type: Number }) count!: number;
  @ApiProperty({ type: [NoticeDto] }) items!: NoticeDto[];
}
const MAX_ITEMS = 30;
const reqSelect = {
  id: true, slot: true, state: true, createdAt: true, sentAt: true, expiresAt: true, fullName: true,
  evidenceReview: { select: { decision: true } },
} as const;
const open = { orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }], select: reqSelect, take: 40 };

@Injectable()
export class NotificationsService {
  constructor(@Inject(Database) private db: Database) {}

  async forUser(actor: AuthRequest["actor"]): Promise<NotificationsDto> {
    const perms = actor.permissions;
    let items: Notice[] = [];
    if (perms.includes("profile.own")) items = await this.employee(actor.id);
    else if (perms.includes("employees.manage") || perms.includes("reviews.assigned") || perms.includes("forms.manage"))
      items = await this.hr(actor);
    else throw new ForbiddenException("No notifications for this account.");
    items = sortNotices(items);
    return { count: items.filter((i) => i.kind !== "info").length, items: items.slice(0, MAX_ITEMS) };
  }

  private async employee(userId: string): Promise<Notice[]> {
    const e = await this.db.employee.findUnique({ where: { userId }, select: { id: true } });
    if (!e) return [];
    const rows = await this.db.formAssignment.findMany({
      where: { onboardingCase: { employeeId: e.id, status: "ACTIVE" } },
      orderBy: { createdAt: "asc" },
      take: 100,
      include: {
        formVersion: { select: { title: true, recipient: true } },
        response: { select: { status: true } },
        guarantorRule: { select: { required: true } },
        externalRequests: open,
      },
    });
    const list: NoticeAssignment[] = rows.map((a) => ({
      id: a.id,
      title: a.formVersion.title,
      recipient: a.formVersion.recipient,
      dueDate: a.dueDate?.toISOString().slice(0, 10) ?? null,
      responseStatus: a.response?.status ?? null,
      required: a.guarantorRule?.required ?? 1,
      requests: a.externalRequests,
    }));
    return employeeNotices(list);
  }

  private async hr(actor: AuthRequest["actor"]): Promise<Notice[]> {
    const perms = actor.permissions;
    const scope = {
      reviewEmployeeForms: perms.includes("reviews.assigned"),
      reviewGuarantorFiles: perms.includes("forms.manage"),
      chaseGuarantors: perms.includes("employees.manage"),
    };
    // Forms an employee sent in that nobody has decided on yet. A reviewer who is not HR
    // only sees the forms they were given.
    const submissions = scope.reviewEmployeeForms
      ? await this.db.employeeResponse.findMany({
          where: {
            status: "SUBMITTED",
            assignment: {
              onboardingCase: { status: "ACTIVE" },
              ...(actor.role === "HR" ? {} : { reviewAccess: { is: { reviewerId: actor.id } } }),
            },
          },
          take: 100,
          orderBy: { updatedAt: "asc" },
          select: {
            assignmentId: true,
            assignment: {
              select: {
                formVersion: { select: { title: true } },
                onboardingCase: { select: { employee: { select: { id: true, fullName: true } } } },
              },
            },
          },
        })
      : [];
    const external = scope.reviewGuarantorFiles || scope.chaseGuarantors
      ? await this.db.formAssignment.findMany({
          where: {
            onboardingCase: { status: "ACTIVE" },
            formVersion: { recipient: { not: "EMPLOYEE" } },
            externalRequests: { some: { state: { in: ["SENT", "UNCERTAIN", "ACTIVE", "SUBMITTED"] } } },
          },
          take: 200,
          include: {
            formVersion: { select: { title: true, recipient: true } },
            guarantorRule: { select: { required: true } },
            onboardingCase: { select: { employee: { select: { id: true, fullName: true } } } },
            externalRequests: open,
          },
        })
      : [];
    const ext: HrAssignment[] = external.map((a) => ({
      id: a.id,
      title: a.formVersion.title,
      recipient: a.formVersion.recipient,
      dueDate: null,
      responseStatus: null,
      required: a.guarantorRule?.required ?? 1,
      requests: a.externalRequests,
      employeeId: a.onboardingCase.employee.id,
      employeeName: a.onboardingCase.employee.fullName,
    }));
    return hrNotices(
      submissions.map((s) => ({
        assignmentId: s.assignmentId,
        title: s.assignment.formVersion.title,
        employeeId: s.assignment.onboardingCase.employee.id,
        employeeName: s.assignment.onboardingCase.employee.fullName,
      })),
      ext,
      scope,
    );
  }
}

@ApiTags("Notifications")
@ApiUnauthorizedResponse({ type: AuthErrorDto })
@UseGuards(SessionGuard)
@Controller("me")
export class NotificationsController {
  constructor(@Inject(NotificationsService) private service: NotificationsService) {}
  @Get("notifications") @ApiOkResponse({ type: NotificationsDto }) list(@Req() r: AuthRequest) {
    return this.service.forUser(r.actor);
  }
}
