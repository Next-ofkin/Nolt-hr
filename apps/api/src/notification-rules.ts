// Works out what needs a person's attention, from data we already store.
// Nothing here is saved: a line disappears as soon as the thing is done.
import { isLate, latestPerSlot, slotStatus, waitingDays, type SlotRequest } from "./external-status.js";

export type Notice = {
  id: string;
  /** "action" = needs you now, "late" = someone is overdue, "info" = good to know. */
  kind: "action" | "late" | "info";
  title: string;
  detail: string;
  href: string;
};
type Req = SlotRequest & {
  fullName: string;
  expiresAt: Date;
  createdAt: Date;
  sentAt: Date | null;
};
export type NoticeAssignment = {
  id: string;
  title: string;
  recipient: string; // EMPLOYEE, GUARANTOR or REFERENCE
  dueDate: string | null;
  responseStatus: string | null; // employee forms only
  required: number; // guarantors needed
  requests: Req[];
};
const word = (recipient: string) => (recipient === "REFERENCE" ? "referee" : "guarantor");
const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
const order = { late: 0, action: 1, info: 2 } as const;
export const sortNotices = (items: Notice[]) =>
  [...items].sort((a, b) => order[a.kind] - order[b.kind] || a.id.localeCompare(b.id));

/** For an expired link: it was sent but nobody finished before it ran out. */
const expired = (r: Req, now: Date) =>
  ["SENT", "UNCERTAIN", "ACTIVE"].includes(r.state) && r.expiresAt <= now;

export function employeeNotices(list: NoticeAssignment[], now = new Date()): Notice[] {
  const out: Notice[] = [];
  for (const a of list) {
    if (a.recipient === "EMPLOYEE") {
      const s = a.responseStatus ?? "NOT_STARTED";
      const href = `/?open=${a.id}`;
      const due = a.dueDate ? `Due ${a.dueDate}` : "";
      if (s === "CHANGES_REQUIRED")
        out.push({ id: `${a.id}:changes`, kind: "late", title: `HR asked for changes: ${a.title}`, detail: "Open the form, fix it and send it again.", href });
      else if (s === "NOT_STARTED" || s === "DRAFT")
        out.push({ id: `${a.id}:fill`, kind: "action", title: `${s === "DRAFT" ? "Finish" : "Fill in"}: ${a.title}`, detail: due, href });
      continue;
    }
    const w = word(a.recipient);
    const latest = latestPerSlot(a.requests);
    for (let slot = 1; slot <= Math.max(1, a.required); slot++) {
      const r = latest.get(slot);
      const n = a.required > 1 ? ` ${slot}` : "";
      const base = `${a.id}:${slot}`;
      const href = "/";
      if (r && expired(r, now)) {
        out.push({ id: `${base}:expired`, kind: "late", title: `${r.fullName}'s link ran out (${a.title})`, detail: `Send ${r.fullName.split(" ")[0]} a new link.`, href });
        continue;
      }
      const st = slotStatus(r);
      if (st === "NONE") {
        out.push(r?.state === "FAILED"
          ? { id: `${base}:failed`, kind: "late", title: `The email to ${r.fullName} could not be sent`, detail: "Check the email address and send it again.", href }
          : { id: `${base}:add`, kind: "action", title: `Add your ${w}${n}: ${a.title}`, detail: "Type a name and email and tap Send.", href });
      } else if (st === "CHANGES_REQUIRED") {
        out.push({ id: `${base}:changes`, kind: "late", title: `HR asked for changes from your ${w}${n}`, detail: a.title, href });
      } else if (st === "IN_PROGRESS" && r && isLate(r, now)) {
        out.push({ id: `${base}:late`, kind: "late", title: `${r.fullName} has not replied`, detail: `Waiting ${days(waitingDays(r, now) ?? 0)}. Tap to send a reminder.`, href });
      } else if (st === "SUBMITTED" && r) {
        out.push({ id: `${base}:submitted`, kind: "info", title: `${r.fullName} sent the form`, detail: "HR will review it.", href });
      }
    }
  }
  return sortNotices(out);
}

export type HrAssignment = NoticeAssignment & { employeeId: string; employeeName: string };
export type HrScope = { reviewEmployeeForms: boolean; reviewGuarantorFiles: boolean; chaseGuarantors: boolean };

export function hrNotices(
  employeeSubmissions: { assignmentId: string; employeeId: string; employeeName: string; title: string }[],
  external: HrAssignment[],
  scope: HrScope,
  now = new Date(),
): Notice[] {
  const out: Notice[] = [];
  if (scope.reviewEmployeeForms)
    for (const s of employeeSubmissions)
      out.push({ id: `${s.assignmentId}:review`, kind: "action", title: `Review: ${s.title}`, detail: s.employeeName, href: `/employees?employee=${s.employeeId}` });
  for (const a of external) {
    const href = `/employees?employee=${a.employeeId}`;
    const latest = latestPerSlot(a.requests);
    for (let slot = 1; slot <= Math.max(1, a.required); slot++) {
      const r = latest.get(slot);
      if (!r) continue;
      const base = `${a.id}:${slot}`;
      if (r.state === "SUBMITTED" && !r.evidenceReview && scope.reviewGuarantorFiles)
        out.push({ id: `${base}:review`, kind: "action", title: `Review ${word(a.recipient)} files: ${a.title}`, detail: `${r.fullName} for ${a.employeeName}`, href });
      else if (scope.chaseGuarantors && (expired(r, now) || isLate(r, now)))
        out.push({ id: `${base}:late`, kind: "late", title: `${r.fullName} has not replied`, detail: `${word(a.recipient)} for ${a.employeeName}, ${expired(r, now) ? "link ran out" : `waiting ${days(waitingDays(r, now) ?? 0)}`}`, href });
    }
  }
  return sortNotices(out);
}
