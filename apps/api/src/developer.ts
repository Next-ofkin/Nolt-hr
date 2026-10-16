import {
  Controller, Get, Inject, Injectable, UseGuards,
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
class DeveloperOverviewDto {
  @ApiProperty({ type: AccountSummaryDto }) summary!: AccountSummaryDto;
  @ApiProperty({ type: [HrAccountDto] }) hrAccounts!: HrAccountDto[];
  @ApiProperty() inviteEnabled!: boolean;
}
@Injectable()
export class DeveloperOverviewService {
  constructor(@Inject(Database) private readonly db: Database) {}
  async overview(): Promise<DeveloperOverviewDto> {
    const [groups, hrAccounts] = await this.db.$transaction([
      this.db.user.groupBy({
        by: ["role"],
        orderBy: { role: "asc" },
        where: { active: true },
        _count: { _all: true },
      }),
      this.db.user.findMany({
        where: { role: "HR" },
        select: { id: true, name: true, email: true, active: true, createdAt: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50,
      }),
    ]);
    const count = (role: string) =>
      groups.find((g) => g.role === role)?._count._all ?? 0;
    return {
      summary: {
        developers: count("DEVELOPER"),
        hr: count("HR"),
        employees: count("EMPLOYEE"),
        totalActive: groups.reduce((sum, g) => sum + g._count._all, 0),
      },
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
  overview() { return this.service.overview(); }
}
