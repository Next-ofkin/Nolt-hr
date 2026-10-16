import { Inject, Injectable } from "@nestjs/common";
import { Database } from "./database.js";
import { HrInvitationDeliveryLedger } from "./hr-invitation-ledger.js";
import { deliverHrInvitationEmail, hrRecipientAllowed, type HrDeliveryResult } from "./hr-invitation-delivery.js";

/** Separate worker: no external provider call is made with the feature gate off. */
@Injectable()
export class HrInvitationWorker {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(HrInvitationDeliveryLedger) private readonly ledger: HrInvitationDeliveryLedger,
  ) {}

  protected send(invitation: { id: string; email: string; name: string }): Promise<HrDeliveryResult> {
    return deliverHrInvitationEmail(invitation);
  }

  async deliverNext(): Promise<boolean> {
    if (process.env.HR_INVITATION_DELIVERY_ENABLED !== "true") return false;
    const job = await this.db.$transaction(async (tx) => {
      // SENDING is never reclaimed automatically: a provider call may have
      // succeeded just before a worker crash. Manual reconciliation required.
      const ids = await tx.$queryRaw<{id:string}[]>`SELECT id FROM public."HrInvitation"
        WHERE state='QUEUED' ORDER BY "createdAt",id FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!ids.length) return null;
      const invitation = await tx.hrInvitation.findUniqueOrThrow({ where: { id: ids[0].id } });
      if (!invitation.expiresAt || invitation.expiresAt <= new Date() || invitation.revokedAt ||
          !hrRecipientAllowed(invitation.email)) {
        await tx.hrInvitation.update({
          where: { id: invitation.id },
          data: { state: "FAILED", deliveryError: "RECIPIENT_NOT_APPROVED_OR_EXPIRED" },
        });
        return { skipped: true as const };
      }
      const existing = await tx.user.findUnique({ where: { email: invitation.email }, select: { id: true } });
      const employee = await tx.employee.findUnique({ where: { email: invitation.email }, select: { id: true } });
      if (existing || employee) {
        await tx.hrInvitation.update({
          where: { id: invitation.id },
          data: { state: "FAILED", deliveryError: "EXISTING_ACCOUNT" },
        });
        return { skipped: true as const };
      }
      await tx.hrInvitation.update({
        where: { id: invitation.id },
        data: { state: "SENDING", deliveryAttempts: { increment: 1 } },
      });
      return { skipped: false as const, invitation };
    });
    if (!job) return false;
    if (job.skipped) return true;
    // External side effect takes place only AFTER the exclusive claim has committed.
    // Failure or network ambiguity never retries automatically.
    const result = await this.send(job.invitation);
    await this.ledger.record(job.invitation.id, result);
    return true;
  }
}
