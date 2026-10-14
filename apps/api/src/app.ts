import "reflect-metadata";
import {
  Controller,
  Get,
  Inject,
  Module,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Database } from "./database.js";
import { ResponsesController, ResponsesService } from "./responses.js";
import { AuthController, HrGuard, SessionGuard } from "./auth.js";
import { FormsController, FormsService } from "./forms.js";
import { Sessions } from "./sessions.js";
import { SupabaseAuth } from "./supabase-auth.js";
import {
  InvitationsService,
  InvitationsController,
  InvitationActivationController,
} from "./invitations.js";
import {
  EmployeesController,
  EmployeesService,
  EmployeesGuard,
  MyOnboardingController,
} from "./employees.js";
@Controller("health")
@ApiTags("Health")
class HealthController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @Get("live") live() {
    return { status: "ok", service: "nolt-api" };
  }
  @Get("ready") async ready() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return { status: "ready" };
    } catch {
      throw new ServiceUnavailableException("Database is unavailable.");
    }
  }
}
@Module({
  controllers: [
    HealthController,
    ResponsesController,
    AuthController,
    FormsController,
    EmployeesController,
    MyOnboardingController,
    InvitationsController,
    InvitationActivationController,
  ],
  providers: [
    Database,
    ResponsesService,
    Sessions,
    SupabaseAuth,
    SessionGuard,
    HrGuard,
    FormsService,
    EmployeesService,
    EmployeesGuard,
    InvitationsService,
  ],
})
export class AppModule {}
