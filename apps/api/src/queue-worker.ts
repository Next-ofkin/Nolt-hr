import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { InvitationsService } from "./invitations.js";
import { ExternalRequestsService } from "./external-requests.js";
import { HrInvitationWorker } from "./hr-invitation-worker.js";

@Injectable()
export class QueueWorkerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  constructor(
    private readonly invitations: InvitationsService,
    private readonly external: ExternalRequestsService,
    private readonly hrInvitations: HrInvitationWorker,
  ) {}

  onApplicationBootstrap() {
    this.schedule(1000);
  }

  onApplicationShutdown() {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  trigger() {
    setImmediate(() => {
      void this.tick().catch(() => {});
    });
  }

  private schedule(delayMs: number) {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.tick().finally(() => {
        this.schedule(5000);
      });
    }, delayMs);
  }

  async tick() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      while (!this.stopped) {
        const staff = await this.invitations.deliverNext();
        const external = await this.external.deliverNext();
        const hr = await this.hrInvitations.deliverNext();
        if (!staff && !external && !hr) break;
      }
    } catch {
      // Safe non-blocking sweep handler
    } finally {
      this.running = false;
    }
  }
}
