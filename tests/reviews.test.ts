import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewDecisionSchema, reviewAccessSchema } from "@nolt/form-schemas";
import { permissionsFor } from "../apps/api/src/security.js";

test("review access requires explicit classification and technical administration does not imply review access", () => {
  assert.equal(
    reviewAccessSchema.safeParse({ reviewerEmail: "hr@example.com" }).success,
    false,
  );
  assert.equal(
    reviewAccessSchema.safeParse({
      reviewerEmail: "hr@example.com",
      sensitivity: "GENERAL",
      permissions: ["health.read"],
    }).success,
    false,
  );
  assert.equal(
    permissionsFor({ role: "SYSTEM_ADMIN", permissions: [] }).includes(
      "reviews.assigned",
    ),
    false,
  );
  assert.equal(
    permissionsFor({ role: "HR", permissions: [] }).includes("health.read"),
    false,
  );
  assert.equal(
    permissionsFor({ role: "HR", permissions: [] }).includes(
      "reviews.assigned",
    ),
    true,
  );
});

test("review decision approves without reason", () => {
  const result = reviewDecisionSchema.safeParse({
    decision: "APPROVED",
    expectedSubmissionVersion: 1,
    expectedResponseRevision: 1,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.decision, "APPROVED");
    assert.equal(result.data.reason, "");
  }
});

test("review decision requesting changes requires a non-empty reason", () => {
  const missingReason = reviewDecisionSchema.safeParse({
    decision: "CHANGES_REQUIRED",
    expectedSubmissionVersion: 1,
    expectedResponseRevision: 1,
  });
  assert.equal(missingReason.success, false);

  const emptyReason = reviewDecisionSchema.safeParse({
    decision: "CHANGES_REQUIRED",
    reason: "   ",
    expectedSubmissionVersion: 1,
    expectedResponseRevision: 1,
  });
  assert.equal(emptyReason.success, false);

  const validReason = reviewDecisionSchema.safeParse({
    decision: "CHANGES_REQUIRED",
    reason: "Please update your legal name to match your government ID.",
    expectedSubmissionVersion: 1,
    expectedResponseRevision: 1,
  });
  assert.equal(validReason.success, true);
  if (validReason.success) {
    assert.equal(validReason.data.decision, "CHANGES_REQUIRED");
    assert.equal(
      validReason.data.reason,
      "Please update your legal name to match your government ID.",
    );
  }
});

test("review decision rejects invalid version or revision", () => {
  assert.equal(
    reviewDecisionSchema.safeParse({
      decision: "APPROVED",
      expectedSubmissionVersion: 0,
      expectedResponseRevision: 1,
    }).success,
    false,
  );
  assert.equal(
    reviewDecisionSchema.safeParse({
      decision: "APPROVED",
      expectedSubmissionVersion: 1,
      expectedResponseRevision: -1,
    }).success,
    false,
  );
});
