import test from "node:test";
import assert from "node:assert/strict";
import { externalAssignmentStatus, latestPerSlot } from "../apps/api/src/external-status.js";
import { latestForSlot, progressLabel, stillSending, viewOf } from "../apps/web/src/lib/guarantor-slots.js";

const t = (n: number) => new Date(2026, 9, 21, 10, n);
const r = (slot: number, state: string, min: number, decision?: string) =>
  ({ id: `r${min}`, slot, state, createdAt: t(min), evidenceReview: decision ? { decision } : null });

test("nothing sent means not started; anything in flight means in progress", () => {
  assert.equal(externalAssignmentStatus([], 1), "NOT_STARTED");
  assert.equal(externalAssignmentStatus([r(1, "SENT", 1)], 1), "DRAFT");
  assert.equal(externalAssignmentStatus([r(1, "REVOKED", 1)], 1), "NOT_STARTED");
});
test("one guarantor behaves as before", () => {
  assert.equal(externalAssignmentStatus([r(1, "SUBMITTED", 1)], 1), "EXTERNAL_SUBMITTED");
  assert.equal(externalAssignmentStatus([r(1, "SUBMITTED", 1, "APPROVED")], 1), "APPROVED");
  assert.equal(externalAssignmentStatus([r(1, "SUBMITTED", 1, "CHANGES_REQUIRED")], 1), "CHANGES_REQUIRED");
});
test("two guarantors: approved only when both are approved", () => {
  const one = [r(1, "SUBMITTED", 1, "APPROVED")];
  assert.equal(externalAssignmentStatus(one, 2), "DRAFT");
  assert.equal(externalAssignmentStatus([...one, r(2, "SUBMITTED", 2)], 2), "EXTERNAL_SUBMITTED");
  assert.equal(externalAssignmentStatus([...one, r(2, "SUBMITTED", 2, "APPROVED")], 2), "APPROVED");
  assert.equal(externalAssignmentStatus([...one, r(2, "SUBMITTED", 2, "CHANGES_REQUIRED")], 2), "CHANGES_REQUIRED");
});
test("only the newest request in a slot counts, so a swapped guarantor replaces the old one", () => {
  const list = [r(1, "REVOKED", 1), r(1, "SENT", 2)];
  assert.equal(latestPerSlot(list).get(1)?.state, "SENT");
  // an extra slot left over after HR lowers the number is ignored
  assert.equal(externalAssignmentStatus([r(1, "SUBMITTED", 1, "APPROVED"), r(2, "SENT", 2)], 1), "APPROVED");
});
test("employee-facing wording", () => {
  const item = (state: string, slot = 1) => ({ id: state, slot, state, email: "a@b.c", fullName: "A", expiresAt: "", correctionReason: null });
  assert.equal(viewOf(undefined), "EMPTY");
  assert.equal(viewOf(item("SENT")), "IN_PROGRESS");
  assert.equal(viewOf(item("FAILED")), "EMPTY");
  assert.equal(viewOf(item("SUBMITTED")), "WAITING_HR");
  assert.equal(viewOf(item("APPROVED")), "APPROVED");
  assert.equal(viewOf(item("CHANGES_REQUIRED")), "CHANGES_REQUIRED");
  assert.equal(latestForSlot([item("SENT", 2), item("SENT", 1)], 1)?.slot, 1);
  assert.equal(stillSending([item("QUEUED")]), true);
  assert.equal(stillSending([item("SENT")]), false);
  assert.match(progressLabel("UNCERTAIN"), /send it again/);
});
