import {
  Controller, Get, Inject, Injectable, Query, UseGuards,
} from "@nestjs/common";
import { ApiOkResponse, ApiProperty, ApiTags } from "@nestjs/swagger";
import { Database } from "./database.js";
import { DeveloperGuard, SessionGuard } from "./auth.js";

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
  async overview(pageInput: number, pageSizeInput: number): Promise<DeveloperOverviewDto> {
    const page = Number.isSafeInteger(pageInput) && pageInput >= 1 && pageInput <= 100000 ? pageInput : 1;
    const pageSize = [5, 10, 20].includes(pageSizeInput) ? pageSizeInput : 10;
    const [developers, hr, employees, totalActive, hrTotal, hrAccounts] =
      await this.db.$transaction([
        this.db.user.count({ where: { active: true, role: "DEVELOPER" } }),
        this.db.user.count({ where: { active: true, role: "HR" } }),
        this.db.user.count({ where: { active: true, role: "EMPLOYEE" } }),
        this.db.user.count({ where: { active: true } }),
        this.db.user.count({ where: { role: "HR" } }),
        this.db.user.findMany({
          where: { role: "HR" },
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
  overview(@Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    return this.service.overview(Number(page ?? 1), Number(pageSize ?? 10));
  }
}
