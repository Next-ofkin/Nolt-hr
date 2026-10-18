import assert from "node:assert/strict";
import test from "node:test";
import { hrRecipientAllowed, hrDeliveryError, deliverHrInvitationEmail } from "../apps/api/src/hr-invitation-delivery.js";

const ready = {
  HR_INVITATION_DELIVERY_ENABLED: "true",
  HR_INVITATION_TEST_RECIPIENTS: "safe-hr@example.invalid, second@example.invalid",
} as NodeJS.ProcessEnv;
test("HR email delivery is disabled unless explicitly enabled and recipient is approved", () => {
  assert.equal(hrRecipientAllowed("safe-hr@example.invalid", {}), false);
  assert.equal(hrRecipientAllowed("safe-hr@example.invalid", { HR_INVITATION_DELIVERY_ENABLED: "true" }), false);
  assert.equal(hrRecipientAllowed("unknown@example.invalid", ready), false);
  assert.equal(hrRecipientAllowed("SAFE-HR@example.invalid", ready), true);
});
test("HR delivery failures classify retry, uncertainty and unsafe codes", () => {
  assert.deepEqual(hrDeliveryError("over_email_send_rate_limit",429),{status:"FAILED",errorCode:"over_email_send_rate_limit",retryable:true});
  assert.deepEqual(hrDeliveryError("server_error",503),{status:"UNCERTAIN",errorCode:"server_error",retryable:false});
  assert.deepEqual(hrDeliveryError("invalid code!",400),{status:"FAILED",errorCode:"PROVIDER_REJECTED",retryable:false});
});
test("HR delivery requires a valid creation proof before any send", async () => {
  const base = { id: "e4b703d5-bf2c-4555-bfb1-6e63d452af3a", email: "safe-hr@example.invalid", name: "Test" };
  for (const creationSecret of [undefined, "", "wrong", "A".repeat(64), "g".repeat(64)]) {
    assert.deepEqual(await deliverHrInvitationEmail({ ...base, creationSecret }, ready), {
      status: "FAILED", errorCode: "CREATION_PROOF_MISSING", retryable: false,
    });
  }
});
test("HR delivery transport cannot send while disabled or recipient missing from allowlist", async () => {
  const invitation = {
    id: "e4b703d5-bf2c-4555-bfb1-6e63d452af3a",
    email: "unapproved@example.invalid", name: "Test",
    creationSecret: "a".repeat(64),
  };
  assert.deepEqual(await deliverHrInvitationEmail(invitation, {}), {
    status: "FAILED", errorCode: "RECIPIENT_NOT_APPROVED", retryable: false,
  });
  assert.deepEqual(await deliverHrInvitationEmail(invitation, ready), {
    status: "FAILED", errorCode: "RECIPIENT_NOT_APPROVED", retryable: false,
  });
  assert.deepEqual(await deliverHrInvitationEmail({ ...invitation, email: "safe-hr@example.invalid" }, ready), {
    status: "FAILED", errorCode: "SENDER_NOT_CONFIGURED", retryable: false,
  });
});
