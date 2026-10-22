import test from "node:test";
import assert from "node:assert/strict";
import { isLate, waitingDays } from "../apps/api/src/external-status.js";
import { employeeNotices, hrNotices, type HrAssignment, type NoticeAssignment } from "../apps/api/src/notification-rules.js";
import { badgeText, idFromSearch } from "../apps/web/src/lib/notices.js";
import { waitingNote } from "../apps/web/src/lib/guarantor-slots.js";

const now = new Date("2026-10-22T10:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * 86_400_000 - 1000);
const later = (d: number) => new Date(now.getTime() + d * 86_400_000);
const req = (o: Partial<NoticeAssignment["requests"][number]> & { state: string }) => ({
  id: "r1", slot: 1, createdAt: ago(5), sentAt: ago(0), expiresAt: later(5), fullName: "Ada Obi", evidenceReview: null, ...o,
});
const form = (o: Partial<NoticeAssignment>): NoticeAssignment => ({
  id: "a1", title: "Guarantor Form", recipient: "GUARANTOR", dueDate: null, responseStatus: null, required: 1, requests: [], ...o,
});

test("waiting rule: 2 days unopened, 3 days opened, only while still waiting", () => {
  assert.equal(isLate({ state: "SENT", sentAt: ago(1) }, now), false);
  assert.equal(isLate({ state: "SENT", sentAt: ago(2) }, now), true);
  assert.equal(isLate({ state: "UNCERTAIN", sentAt: ago(2) }, now), true);
  assert.equal(isLate({ state: "ACTIVE", sentAt: ago(2) }, now), false);
  assert.equal(isLate({ state: "ACTIVE", sentAt: ago(3) }, now), true);
  assert.equal(isLate({ state: "SUBMITTED", sentAt: ago(9) }, now), false);
  assert.equal(waitingDays({ state: "SENT", sentAt: ago(3) }, now), 3);
  assert.equal(waitingDays({ state: "REVOKED", sentAt: ago(3) }, now), null);
  assert.equal(waitingDays({ state: "SENT", sentAt: null, createdAt: ago(4) }, now), 4);
});

test("employee: forms to fill, changes asked, nothing for finished ones", () => {
  const list = [
    form({ id: "f1", title: "Bio data", recipient: "EMPLOYEE", responseStatus: null, dueDate: "2026-10-30" }),
    form({ id: "f2", title: "Tax form", recipient: "EMPLOYEE", responseStatus: "DRAFT" }),
    form({ id: "f3", title: "Contract", recipient: "EMPLOYEE", responseStatus: "CHANGES_REQUIRED" }),
    form({ id: "f4", title: "Handbook", recipient: "EMPLOYEE", responseStatus: "SUBMITTED" }),
    form({ id: "f5", title: "Policy", recipient: "EMPLOYEE", responseStatus: "APPROVED" }),
  ];
  const out = employeeNotices(list, now);
  assert.deepEqual(out.map((n) => n.id), ["f3:changes", "f1:fill", "f2:fill"]);
  assert.equal(out[0]!.kind, "late");
  assert.equal(out[1]!.detail, "Due 2026-10-30");
  assert.equal(out[1]!.href, "/?open=f1");
  assert.match(out[2]!.title, /^Finish/);
});

test("employee: guarantor not added, late, expired, failed, submitted", () => {
  assert.equal(employeeNotices([form({})], now)[0]!.id, "a1:1:add");
  const late = employeeNotices([form({ requests: [req({ state: "SENT", sentAt: ago(2) })] })], now);
  assert.equal(late[0]!.kind, "late");
  assert.match(late[0]!.detail, /Waiting 2 days/);
  assert.deepEqual(employeeNotices([form({ requests: [req({ state: "SENT", sentAt: ago(1) })] })], now), []);
  const gone = employeeNotices([form({ requests: [req({ state: "SENT", sentAt: ago(1), expiresAt: ago(0) })] })], now);
  assert.equal(gone[0]!.id, "a1:1:expired");
  assert.equal(employeeNotices([form({ requests: [req({ state: "FAILED" })] })], now)[0]!.id, "a1:1:failed");
  const sub = employeeNotices([form({ requests: [req({ state: "SUBMITTED" })] })], now);
  assert.equal(sub[0]!.kind, "info");
  assert.deepEqual(employeeNotices([form({ requests: [req({ state: "SUBMITTED", evidenceReview: { decision: "APPROVED" } })] })], now), []);
  const changes = employeeNotices([form({ requests: [req({ state: "SUBMITTED", evidenceReview: { decision: "CHANGES_REQUIRED" } })] })], now);
  assert.equal(changes[0]!.id, "a1:1:changes");
});

test("employee: two guarantors are checked one by one", () => {
  const out = employeeNotices([form({ required: 2, requests: [req({ state: "SENT", sentAt: ago(3) })] })], now);
  assert.deepEqual(out.map((n) => n.id), ["a1:1:late", "a1:2:add"]);
  assert.match(out[1]!.title, /guarantor 2/);
});

test("HR: reviews, guarantor files, late guarantors, and permission scope", () => {
  const ext: HrAssignment[] = [
    { ...form({ id: "g1", requests: [req({ state: "SUBMITTED" })] }), employeeId: "e1", employeeName: "Bola Ade" },
    { ...form({ id: "g2", requests: [req({ id: "r2", state: "SENT", sentAt: ago(4) })] }), employeeId: "e2", employeeName: "Chi Eze" },
    { ...form({ id: "g3", requests: [req({ id: "r3", state: "SUBMITTED", evidenceReview: { decision: "APPROVED" } })] }), employeeId: "e3", employeeName: "Dan Uba" },
  ];
  const subs = [{ assignmentId: "s1", employeeId: "e4", employeeName: "Eve Okon", title: "Bio data" }];
  const all = hrNotices(subs, ext, { reviewEmployeeForms: true, reviewGuarantorFiles: true, chaseGuarantors: true }, now);
  assert.deepEqual(all.map((n) => n.id), ["g2:1:late", "g1:1:review", "s1:review"]);
  assert.equal(all[2]!.href, "/employees?employee=e4");
  const reviewer = hrNotices(subs, ext, { reviewEmployeeForms: true, reviewGuarantorFiles: false, chaseGuarantors: false }, now);
  assert.deepEqual(reviewer.map((n) => n.id), ["s1:review"]);
});

test("web helpers", () => {
  assert.equal(badgeText(3), "3");
  assert.equal(badgeText(12), "9+");
  const id = "0b63c9aa-1111-4222-8333-444455556666";
  assert.equal(idFromSearch(`?open=${id}`, "open"), id);
  assert.equal(idFromSearch("?open=../../x", "open"), null);
  assert.equal(idFromSearch("", "employee"), null);
  assert.equal(waitingNote({ waitingDays: 0, state: "SENT" }), "");
  assert.equal(waitingNote({ waitingDays: 1, state: "SENT" }), "Waiting 1 day");
  assert.equal(waitingNote({ waitingDays: 3, state: "SENT" }), "Waiting 3 days");
});
