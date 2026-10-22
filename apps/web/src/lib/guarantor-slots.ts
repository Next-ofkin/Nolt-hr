// Plain-language view of a guarantor request for the employee, one card per slot.
export type SlotItem = {
  id: string; slot: number; state: string; email: string; fullName: string;
  expiresAt: string; correctionReason: string | null;
  waitingDays?: number | null; late?: boolean;
};
export type SlotView =
  | "EMPTY" // nothing sent yet, or the last one was cancelled, expired or failed
  | "IN_PROGRESS" // queued, sent or opened, not submitted yet: can still be changed
  | "WAITING_HR" // submitted, HR has not decided
  | "APPROVED"
  | "CHANGES_REQUIRED";

export function latestForSlot(items: SlotItem[], slot: number): SlotItem | undefined {
  return items.filter((i) => i.slot === slot)[0]; // the API sends newest first
}
export function viewOf(item: SlotItem | undefined): SlotView {
  if (!item) return "EMPTY";
  if (item.state === "APPROVED") return "APPROVED";
  if (item.state === "CHANGES_REQUIRED") return "CHANGES_REQUIRED";
  if (item.state === "SUBMITTED") return "WAITING_HR";
  if (["QUEUED", "SENDING", "SENT", "UNCERTAIN", "ACTIVE"].includes(item.state)) return "IN_PROGRESS";
  return "EMPTY";
}
export function progressLabel(state: string): string {
  switch (state) {
    case "QUEUED": return "Queued to send";
    case "SENDING": return "Sending the email…";
    case "SENT": return "Email sent. Waiting for them to open it";
    case "UNCERTAIN": return "Email may not have arrived. You can send it again";
    case "ACTIVE": return "They opened the form and are filling it";
    case "FAILED": return "The email could not be sent";
    case "EXPIRED": return "The link expired";
    case "REVOKED": return "Cancelled";
    case "SUBMITTED": return "Submitted. Waiting for HR";
    case "APPROVED": return "Approved by HR";
    case "CHANGES_REQUIRED": return "HR asked for changes";
    default: return state.toLowerCase().replaceAll("_", " ");
  }
}
/** Keep polling while an email is still on its way. */
export function stillSending(items: SlotItem[]): boolean {
  return items.some((i) => i.state === "QUEUED" || i.state === "SENDING");
}

/** A ready-to-send note for the employee to give the guarantor before the email arrives. */
export function headsUpMessage(o: { guarantorName: string; employeeName: string; role: "GUARANTOR" | "REFERENCE" | string; host: string }): string {
  const role = o.role === "REFERENCE" ? "referee" : "guarantor";
  const first = o.guarantorName.trim().split(/\s+/)[0] || "there";
  const me = o.employeeName.trim() || "your friend";
  return [
    `Hi ${first}, it's ${me}. I have named you as my ${role} for my new job at NOLT Finance.`,
    `You will get an email from NOLT Finance titled "${me} named you as a ${role} - NOLT Finance". Please open it and tap "Open form". The link starts with https://${o.host}.`,
    `It takes about 10 minutes. Keep your phone camera ready for a photo of your ID and proof of address, and your finger for the signature. Thank you!`,
  ].join("\n\n");
}

/** "Waiting 3 days" for the card, only once a day has gone by. */
export function waitingNote(item: Pick<SlotItem, "waitingDays" | "state">): string {
  const d = item.waitingDays ?? 0;
  if (d < 1) return "";
  return `Waiting ${d} day${d === 1 ? "" : "s"}`;
}
