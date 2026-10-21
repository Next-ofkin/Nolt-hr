import { inviteEmail } from "./invite-email.js";

/** Guarantor / reference form invitation. Shares the NOLT-branded layout with HR and employee invites. */
export function externalInvitation(title: string, link: string, expiresAt: Date) {
  return inviteEmail("EXTERNAL", { title, link, expiresAt });
}
