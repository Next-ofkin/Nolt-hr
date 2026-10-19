import assert from "node:assert/strict";
import test from "node:test";
import { ExternalEvidenceReviewService } from "../apps/api/src/external-requests.js";

const owner = "c1010101-0000-4000-8000-000000000001";
const colleague = "c1010101-0000-4000-8000-000000000009";
const assignmentId = "c1010101-0000-4000-8000-000000000002";
const requestId = "c1010101-0000-4000-8000-000000000003";
const assignment = {
  onboardingCase: { createdBy: owner, status: "ACTIVE" },
  formVersion: { title: "Guarantor form", recipient: "GUARANTOR", description: "",
    fields: [{ id: "c1010101-0000-4000-8000-000000000004", type: "text", label: "Name",
      helpText: "", required: true, options: [], signatureMethod: "EITHER", attachmentPurpose: "SUPPORTING_DOCUMENT" }] },
};
function fakeDb(role = "HR", submitted = true) {
  let writes = 0;
  const tx = {
    $queryRaw: async () => [{ id: assignmentId }],
    user: { findUnique: async () => ({
      id: owner, active: true, role, permissions: [],
    }) },
    formAssignment: { findUnique: async () => assignment },
    externalRequest: {
      findMany: async () => submitted ? [{
        id: requestId, email: "recipient@example.test", fullName: "Recipient",
        submission: { answers: { [assignment.formVersion.fields[0].id]: "A name" },
          submittedAt: new Date("2026-10-19T12:00:00Z") }, evidenceReview: null,
      }] : [],
      findFirst: async ({ select }: { select?: unknown }) =>
        select ? { id: requestId } : submitted ? {
          id: requestId, state: "SUBMITTED",
          submission: { answers: {} }, evidenceReview: null,
        } : null,
      update: async () => { writes++; },
    },
    externalEvidenceReview: { create: async () => { writes++; } },
    auditEvent: { create: async () => { writes++; } },
    outboxEvent: { create: async () => { writes++; } },
  };
  return {
    writes: () => writes,
    db: { $transaction: async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx) },
  };
}

test("employee role cannot read external guarantor evidence even with forms permission", async () => {
  const { db, writes } = fakeDb("EMPLOYEE");
  const service = new ExternalEvidenceReviewService(db as never);
  await assert.rejects(() => service.detail(owner, assignmentId), /HR evidence review access is required/i);
  assert.equal(writes(), 0);
});

test("developer provisioning account cannot access evidence without HR role grant", async () => {
  const { db } = fakeDb("DEVELOPER");
  const service = new ExternalEvidenceReviewService(db as never);
  await assert.rejects(() => service.detail(colleague, assignmentId), /HR evidence review access is required/i);
});

test("authorised HR administrator role can review colleague evidence", async () => {
  const { db } = fakeDb("HR_ADMIN");
  const service = new ExternalEvidenceReviewService(db as never);
  const evidence = await service.detail(colleague, assignmentId);
  assert.equal(evidence.items.length, 1);
});

test("HR case owner can read immutable evidence with original field labels", async () => {
  const { db } = fakeDb();
  const service = new ExternalEvidenceReviewService(db as never);
  const evidence = await service.detail(owner, assignmentId);
  assert.equal(evidence.items.length, 1);
  assert.equal(evidence.fields[0].label, "Name");
  assert.equal(evidence.items[0].decision, null);
});

test("another authorised HR user can review evidence without being the case creator", async () => {
  const { db } = fakeDb();
  const service = new ExternalEvidenceReviewService(db as never);
  const evidence = await service.detail(colleague, assignmentId);
  assert.equal(evidence.items.length, 1);
  assert.equal(evidence.items[0].decision, null);
});

test("another authorised HR user can approve evidence with audit attribution", async () => {
  const { db, writes } = fakeDb();
  const service = new ExternalEvidenceReviewService(db as never);
  const result = await service.decide(colleague, assignmentId, requestId, { decision: "APPROVED" });
  assert.equal(result.decision, "APPROVED");
  assert.equal(writes(), 4);
});

test("cannot approve unsubmitted evidence, and no audit or review is written", async () => {
  const { db, writes } = fakeDb("HR", false);
  const service = new ExternalEvidenceReviewService(db as never);
  await assert.rejects(() => service.decide(owner, assignmentId, requestId,
    { decision: "APPROVED" }), /unavailable or already reviewed/i);
  assert.equal(writes(), 0);
});

test("correction request requires a meaningful explanation before any database write", async () => {
  const { db, writes } = fakeDb();
  const service = new ExternalEvidenceReviewService(db as never);
  await assert.rejects(() => service.decide(owner, assignmentId, requestId,
    { decision: "CHANGES_REQUIRED", reason: "No" }), /request fields/i);
  assert.equal(writes(), 0);
});
