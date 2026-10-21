import { inviteEmail, type Requester } from "./invite-email.js";

/** Guarantor / reference form invitation. Names the employee who asked, so the email is recognisable. */
export function externalInvitation(
  title: string,
  link: string,
  expiresAt: Date,
  extra: { recipientName?: string; requester?: Requester; contact?: string } = {},
) {
  return inviteEmail("EXTERNAL", { title, link, expiresAt, name: extra.recipientName, requester: extra.requester, contact: extra.contact });
}
