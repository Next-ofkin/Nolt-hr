export type HrInvitationStatus =
  | "DRAFT" | "QUEUED" | "SENDING" | "SENT" | "UNCERTAIN"
  | "FAILED" | "EXPIRED" | "ACCEPTED" | "REVOKED";

export interface HrInvitationVerification {
  state: HrInvitationStatus;
  inviteEmail: string;
  confirmedEmail: string | null;
  providerSubject: string | null;
  invitedSubject?: string | null;
  hasExistingAccount: boolean;
  emailVerified: boolean;
  mfaVerified: boolean;
  assuranceLevel: string | null;
  expired: boolean;
  revoked: boolean;
}

/** The link and an authenticated session alone never grant the HR role. */
export function canAcceptHrInvitation(input: HrInvitationVerification): boolean {
  return (
    (input.state === "SENT" || input.state === "UNCERTAIN") &&
    !input.expired &&
    !input.revoked &&
    !input.hasExistingAccount &&
    input.emailVerified &&
    input.mfaVerified &&
    input.assuranceLevel === "aal2" &&
    Boolean(input.providerSubject) &&
    Boolean(input.invitedSubject) &&
    input.providerSubject === input.invitedSubject &&
    Boolean(input.confirmedEmail) &&
    input.inviteEmail.trim().toLowerCase() === input.confirmedEmail?.trim().toLowerCase()
  );
}

export function canQueueHrInvitation(state: HrInvitationStatus): boolean {
  return state === "DRAFT";
}

export function canRevokeHrInvitation(state: HrInvitationStatus): boolean {
  return state !== "REVOKED" && state !== "ACCEPTED";
}
