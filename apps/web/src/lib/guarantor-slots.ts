// Plain-language view of a guarantor request for the employee, one card per slot.
export type SlotItem = {
  id: string; slot: number; state: string; email: string; fullName: string;
  expiresAt: string; correctionReason: string | null;
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
