// How a guarantor or reference form looks to the employee, HR and pack progress when it
// can have more than one guarantor. Each slot has its own latest request; the form is
// only as far along as its slowest slot.
export type SlotRequest = {
  slot: number;
  state: string;
  createdAt?: Date;
  id?: string;
  evidenceReview?: { decision: string } | null;
};
export type SlotStatus = "NONE" | "IN_PROGRESS" | "SUBMITTED" | "CHANGES_REQUIRED" | "APPROVED";

export function latestPerSlot<T extends SlotRequest>(requests: T[]): Map<number, T> {
  const sorted = [...requests].sort(
    (a, b) =>
      (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0) ||
      (b.id ?? "").localeCompare(a.id ?? ""),
  );
  const out = new Map<number, T>();
  for (const r of sorted) if (!out.has(r.slot)) out.set(r.slot, r);
  return out;
}

export function slotStatus(r: SlotRequest | undefined): SlotStatus {
  if (!r) return "NONE";
  if (r.evidenceReview?.decision === "APPROVED") return "APPROVED";
  if (r.evidenceReview?.decision === "CHANGES_REQUIRED") return "CHANGES_REQUIRED";
  if (r.state === "SUBMITTED") return "SUBMITTED";
  if (["QUEUED", "SENDING", "SENT", "UNCERTAIN", "ACTIVE"].includes(r.state)) return "IN_PROGRESS";
  return "NONE"; // revoked, expired or failed: the slot is free again
}

export function externalAssignmentStatus(
  requests: SlotRequest[],
  required = 1,
): "NOT_STARTED" | "DRAFT" | "EXTERNAL_SUBMITTED" | "CHANGES_REQUIRED" | "APPROVED" {
  const latest = latestPerSlot(requests);
  const slots = Array.from({ length: Math.max(1, required) }, (_, i) => slotStatus(latest.get(i + 1)));
  if (slots.every((s) => s === "APPROVED")) return "APPROVED";
  if (slots.some((s) => s === "CHANGES_REQUIRED")) return "CHANGES_REQUIRED";
  if (slots.every((s) => s === "APPROVED" || s === "SUBMITTED")) return "EXTERNAL_SUBMITTED";
  if (slots.some((s) => s !== "NONE")) return "DRAFT";
  return "NOT_STARTED";
}
