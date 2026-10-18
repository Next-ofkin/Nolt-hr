import { ExternalSessions, ExternalSessionGuard } from "./external-sessions.js";
import { QueueWorkerService } from "./queue-worker.js";
import { HrInvitationWorker } from "./hr-invitation-worker.js";
import { HrInvitationDeliveryLedger } from "./hr-invitation-ledger.js";
import { HrInvitationExchangeController, HrInvitationExchangeService } from "./hr-invitation-exchange.js";
import { HrInvitationProofService } from "./hr-invitation-proof.js";
import "reflect-metadata";
import {
  ExternalRequestsController,
  ExternalWorkspaceController,
  ExternalRequestsService,
} from "./external-requests.js";
import {
  ExternalContactsController,
  ExternalContactsService,
} from "./external-contacts.js";
import {
  Controller,
  Get,
  Inject,
  Logger,
  Module,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Database } from "./database.js";
import { DeveloperOverviewController, DeveloperOverviewService } from "./developer.js";
import { databaseReadiness } from "./database-diagnostics.js";
import {
  ResponsesController,
  ResponsesService,
  ReviewsController,
  ReviewGuard,
} from "./responses.js";
import { AuthController, DeveloperGuard, HrGuard, SessionGuard } from "./auth.js";
import { FormsController, FormsService } from "./forms.js";
import { MyPacksController, PacksController, PacksService } from "./packs.js";
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
import { FilesController, FilesService, FilesStorage } from "./files.js";
@Controller("health")
@ApiTags("Health")
class HealthController {
  private readonly logger = new Logger("DatabaseReadiness");
  constructor(@Inject(Database) private readonly db: Database) {}
  @Get("live") live() {
    return { status: "ok", service: "nolt-api" };
  }
  @Get("ready") async ready() {
    return databaseReadiness(
      () => this.db.$queryRaw`SELECT 1`,
      (summary) =>
        this.logger.error(
          `DATABASE_READINESS_FAILED ${JSON.stringify(summary)}`,
        ),
    );
  }
}
@Module({
  controllers: [
    HealthController,
    DeveloperOverviewController,
    HrInvitationExchangeController,
    ResponsesController,
    ReviewsController,
    AuthController,
    FormsController,
    PacksController,
    MyPacksController,
    EmployeesController,
    MyOnboardingController,
    InvitationsController,
    InvitationActivationController,
    FilesController,
    ExternalContactsController,
    ExternalRequestsController,
    ExternalWorkspaceController,
  ],
  providers: [
    Database,
    DeveloperOverviewService,
    HrInvitationExchangeService,
    HrInvitationProofService,
    DeveloperGuard,
    ResponsesService,
    ReviewGuard,
    Sessions,
    SupabaseAuth,
    SessionGuard,
    HrGuard,
    FormsService,
    PacksService,
    EmployeesService,
    EmployeesGuard,
    InvitationsService,
    FilesService,
    FilesStorage,
    ExternalContactsService,
    ExternalRequestsService,
    ExternalSessions,
    ExternalSessionGuard,
    QueueWorkerService,
    HrInvitationWorker,
    HrInvitationDeliveryLedger,
  ],
})
export class AppModule {}
