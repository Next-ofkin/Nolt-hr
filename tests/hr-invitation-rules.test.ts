import assert from "node:assert/strict";
import test from "node:test";
import {
  canAcceptHrInvitation,
  canQueueHrInvitation,
  canRevokeHrInvitation,
  type HrInvitationVerification,
} from "../apps/api/src/hr-invitation-rules.js";

const valid: HrInvitationVerification = {
  state: "SENT",
  inviteEmail: "new-admin@example.invalid",
  confirmedEmail: "NEW-ADMIN@example.invalid",
  providerSubject: "e4b703d5-bf2c-4555-bfb1-6e63d452af3a",
  hasExistingAccount: false,
  emailVerified: true,
  mfaVerified: true,
  assuranceLevel: "aal2",
  expired: false,
  revoked: false,
};

test("HR invitation activation requires confirmed matching email and MFA AAL2", () => {
  assert.equal(canAcceptHrInvitation(valid), true);
  const denials: Partial<HrInvitationVerification>[] = [
    { state: "DRAFT" }, { state: "QUEUED" }, { state: "REVOKED" },
    { state: "ACCEPTED" }, { state: "EXPIRED" }, { state: "FAILED" },
    { expired: true }, { revoked: true }, { hasExistingAccount: true },
    { emailVerified: false }, { mfaVerified: false },
    { assuranceLevel: "aal1" }, { confirmedEmail: null },
    { confirmedEmail: "attacker@example.invalid" }, { providerSubject: null },
  ];
  for (const patch of denials) {
    assert.equal(canAcceptHrInvitation({ ...valid, ...patch }), false, JSON.stringify(patch));
  }
});
test("HR invitation transitions fail closed", () => {
  assert.equal(canQueueHrInvitation("DRAFT"), true);
  assert.equal(canQueueHrInvitation("SENT"), false);
  assert.equal(canRevokeHrInvitation("QUEUED"), true);
  assert.equal(canRevokeHrInvitation("ACCEPTED"), false);
  assert.equal(canRevokeHrInvitation("REVOKED"), false);
});
