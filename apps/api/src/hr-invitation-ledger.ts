import { Inject, Injectable } from "@nestjs/common";
import { Database } from "./database.js";
import type { HrDeliveryResult } from "./hr-invitation-delivery.js";

/**
 * Persist the provider response only after a worker has exclusively claimed
 * SENDING. Never creates users, assigns roles, or sends mail.
 */
@Injectable()
export class HrInvitationDeliveryLedger {
  constructor(@Inject(Database) private readonly db: Database) {}

  async record(invitationId: string, result: HrDeliveryResult) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM public."HrInvitation" WHERE id=${invitationId}::uuid FOR UPDATE`;
      const invitation = await tx.hrInvitation.findUnique({ where: { id: invitationId } });
      if (!invitation || invitation.state !== "SENDING") return false;
      // A provider response cannot prove it created a new account by itself.
      // Only the Auth INSERT trigger can bind the matching single-use proof.
      const recordedResult: HrDeliveryResult = result.status === "SENT" && invitation.creationSubject !== result.providerSubject
        ? { status: "UNCERTAIN", errorCode: "CREATION_PROVENANCE_MISMATCH", retryable: false }
        : result;
      const updated = await tx.hrInvitation.updateMany({
        where: { id: invitationId, state: "SENDING", revokedAt: null },
        data: recordedResult.status === "SENT"
          ? {
              state: "SENT",
              providerSubject: recordedResult.providerSubject,
              deliveryError: null,
              sentAt: new Date(),
            }
          : {
              state: recordedResult.status,
              deliveryError: recordedResult.errorCode,
            },
      });
      if (updated.count !== 1) return false;
      await tx.auditEvent.create({
        data: {
          actorId: invitation.createdBy,
          action: recordedResult.status === "SENT"
            ? "HR_INVITATION_SENT"
            : "HR_INVITATION_DELIVERY_FAILED",
          targetId: invitation.id,
          metadata: { status: recordedResult.status },
        },
      });
      await tx.outboxEvent.create({
        data: {
          type: recordedResult.status === "SENT"
            ? "HR_INVITATION_SENT"
            : "HR_INVITATION_DELIVERY_FAILED",
          targetId: invitation.id,
        },
      });
      return true;
    });
  }
}
