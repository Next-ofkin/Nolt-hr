import {
  BadRequestException, Body, ConflictException, Controller, Get, Inject, Injectable, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req, UseGuards,
} from "@nestjs/common";
import { ApiOkResponse, ApiProperty, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { AuthRequest } from "./auth.js";
import { Database } from "./database.js";
import { DeveloperGuard, SessionGuard } from "./auth.js";

const draftInput = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(254).transform((v) => v.toLowerCase()),
}).strict();
class HrDraftDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty() state!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ nullable: true, type: String }) revokedAt!: string | null;
}
class HrDraftListDto {
  @ApiProperty({ type: [HrDraftDto] }) items!: HrDraftDto[];
}
class AccountSummaryDto {
  @ApiProperty() developers!: number;
  @ApiProperty() hr!: number;
  @ApiProperty() employees!: number;
  @ApiProperty() totalActive!: number;
}
class HrAccountDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty() active!: boolean;
  @ApiProperty() createdAt!: string;
}
class HrPaginationDto {
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}
class DeveloperOverviewDto {
  @ApiProperty({ type: AccountSummaryDto }) summary!: AccountSummaryDto;
  @ApiProperty({ type: [HrAccountDto] }) hrAccounts!: HrAccountDto[];
  @ApiProperty({ type: HrPaginationDto }) hrPagination!: HrPaginationDto;
  @ApiProperty() inviteEnabled!: boolean;
}
@Injectable()
export class DeveloperOverviewService {
  constructor(@Inject(Database) private readonly db: Database) {}
  async drafts(): Promise<HrDraftListDto> {
    const items = await this.db.hrInvitation.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 25,
    });
    return { items: items.map((i) => ({
      id: i.id, name: i.name, email: i.email, state: i.state,
      createdAt: i.createdAt.toISOString(),
      revokedAt: i.revokedAt?.toISOString() ?? null,
    })) };
  }
  async prepare(actorId: string, payload: unknown): Promise<HrDraftDto> {
    const parsed = draftInput.safeParse(payload);
    if (!parsed.success) throw new BadRequestException("Enter a valid full name and email address.");
    const { email, name } = parsed.data;
    try {
      const draft = await this.db.$transaction(async (tx) => {
        const account = await tx.user.findUnique({ where: { email }, select: { id: true } });
        if (account) throw new ConflictException("An account with this email already exists. Existing accounts cannot be invited or promoted.");
        const item = await tx.hrInvitation.create({ data: { email, name, createdBy: actorId } });
        await tx.auditEvent.create({
          data: { actorId, action: "HR_INVITATION_DRAFT_CREATED", targetId: item.id, metadata: { email } },
        });
        await tx.outboxEvent.create({ data: { type: "HR_INVITATION_DRAFT_CREATED", targetId: item.id } });
        return item;
      });
      return { id: draft.id, name: draft.name, email: draft.email, state: draft.state, createdAt: draft.createdAt.toISOString(), revokedAt: null };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002")
        throw new ConflictException("A pending HR invitation draft already exists for this email.");
      throw error;
    }
  }
  async revoke(actorId: string, id: string): Promise<HrDraftDto> {
    const item = await this.db.$transaction(async (tx) => {
      const current = await tx.hrInvitation.findUnique({ where: { id } });
      if (!current) throw new NotFoundException("Invitation draft not found.");
      if (current.state === "REVOKED") return current;
      const result = await tx.hrInvitation.update({
        where: { id },
        data: { state: "REVOKED", revokedAt: new Date() },
      });
      await tx.auditEvent.create({ data: { actorId, action: "HR_INVITATION_DRAFT_REVOKED", targetId: id } });
      await tx.outboxEvent.create({ data: { type: "HR_INVITATION_DRAFT_REVOKED", targetId: id } });
      return result;
    });
    return { id: item.id, name: item.name, email: item.email, state: item.state, createdAt: item.createdAt.toISOString(), revokedAt: item.revokedAt?.toISOString() ?? null };
  }
  async overview(pageInput: number, pageSizeInput: number, searchInput: string, status: string): Promise<DeveloperOverviewDto> {
    const page = Number.isSafeInteger(pageInput) && pageInput >= 1 && pageInput <= 100000 ? pageInput : 1;
    const pageSize = [5, 10, 20].includes(pageSizeInput) ? pageSizeInput : 10;
    const search = searchInput.trim().slice(0, 120);
    const hrWhere = {
      role: "HR",
      ...(status === "active" ? { active: true } : status === "inactive" ? { active: false } : {}),
      ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { email: { contains: search, mode: "insensitive" as const } }] } : {}),
    };
    const [developers, hr, employees, totalActive, hrTotal, hrAccounts] =
      await this.db.$transaction([
        this.db.user.count({ where: { active: true, role: "DEVELOPER" } }),
        this.db.user.count({ where: { active: true, role: "HR" } }),
        this.db.user.count({ where: { active: true, role: "EMPLOYEE" } }),
        this.db.user.count({ where: { active: true } }),
        this.db.user.count({ where: hrWhere }),
        this.db.user.findMany({
          where: hrWhere,
          select: { id: true, name: true, email: true, active: true, createdAt: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);
    return {
      summary: { developers, hr, employees, totalActive },
      hrPagination: { page, pageSize, total: hrTotal, totalPages: Math.max(1, Math.ceil(hrTotal / pageSize)) },
      hrAccounts: hrAccounts.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      })),
      // Never advertise a live invitation action until acceptance is implemented.
      inviteEnabled: false,
    };
  }
}
@ApiTags("Developer administration")
@UseGuards(SessionGuard, DeveloperGuard)
@Controller("developer")
export class DeveloperOverviewController {
  constructor(@Inject(DeveloperOverviewService) private readonly service: DeveloperOverviewService) {}
  @Get("overview")
  @ApiOkResponse({ type: DeveloperOverviewDto })
  @Get("hr-invitation-drafts")
  @ApiOkResponse({ type: HrDraftListDto })
  drafts() { return this.service.drafts(); }

  @Post("hr-invitation-drafts")
  @ApiOkResponse({ type: HrDraftDto })
  prepare(@Req() req: AuthRequest, @Body() payload: unknown) {
    return this.service.prepare(req.actor.id, payload);
  }

  @Post("hr-invitation-drafts/:id/revoke")
  @ApiOkResponse({ type: HrDraftDto })
  revoke(@Req() req: AuthRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.revoke(req.actor.id, id);
  }

  overview(@Query("page") page?: string, @Query("pageSize") pageSize?: string, @Query("search") search?: string, @Query("status") status?: string) {
    return this.service.overview(Number(page ?? 1), Number(pageSize ?? 10), search ?? "", status ?? "all");
  }
}
