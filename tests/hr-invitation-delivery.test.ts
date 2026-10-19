import assert from "node:assert/strict";
import test from "node:test";
import { hrRecipientAllowed, hrDeliveryError, hrProviderDiagnostic, deliverHrInvitationEmail } from "../apps/api/src/hr-invitation-delivery.js";

const ready = {
  HR_INVITATION_DELIVERY_ENABLED: "true",
  HR_INVITATION_TEST_RECIPIENTS: "safe-hr@example.invalid, second@example.invalid",
} as NodeJS.ProcessEnv;
test("HR delivery requires enabled transport, not a per-address allowlist", () => {
  assert.equal(hrRecipientAllowed("safe-hr@example.invalid", {}), false);
  assert.equal(hrRecipientAllowed("safe-hr@example.invalid", { HR_INVITATION_DELIVERY_ENABLED: "true" }), true);
  assert.equal(hrRecipientAllowed("unknown@example.invalid", ready), true);
  assert.equal(hrRecipientAllowed("not-an-email", ready), false);
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
test("HR delivery requires transport gate and configured sender", async () => {
  const invitation = {
    id: "e4b703d5-bf2c-4555-bfb1-6e63d452af3a",
    email: "unapproved@example.invalid", name: "Test",
    creationSecret: "a".repeat(64),
  };
  assert.deepEqual(await deliverHrInvitationEmail(invitation, {}), {
    status: "FAILED", errorCode: "DELIVERY_DISABLED_OR_INVALID_RECIPIENT", retryable: false,
  });
  assert.deepEqual(await deliverHrInvitationEmail(invitation, ready), {
    status: "FAILED", errorCode: "RECIPIENT_NOT_APPROVED", retryable: false,
  });
  assert.deepEqual(await deliverHrInvitationEmail({ ...invitation, email: "safe-hr@example.invalid" }, ready), {
    status: "FAILED", errorCode: "SENDER_NOT_CONFIGURED", retryable: false,
  });
});

test("HR provider diagnostics expose status and safe code but never free-form provider messages", () => {
  assert.equal(hrProviderDiagnostic({ status: 403, code: "not_admin", name: "AuthApiError" }),
    "HR_INVITE_PROVIDER_FAILURE status=403 code=not_admin category=AuthApiError");
  assert.equal(hrProviderDiagnostic({ status: 400, code: "invalid: secret@example.com", name: "UnexpectedName" }),
    "HR_INVITE_PROVIDER_FAILURE status=400 code=PROVIDER_REJECTED category=OTHER");
  assert.equal(hrProviderDiagnostic({}),
    "HR_INVITE_PROVIDER_FAILURE status=unknown code=PROVIDER_REJECTED category=OTHER");
});
