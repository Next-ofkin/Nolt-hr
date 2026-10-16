import assert from "node:assert/strict";
import test from "node:test";
import {
  canAcceptHrInvitation,
  canVerifyHrInvitationIdentity,
  canQueueHrInvitation,
  canRevokeHrInvitation,
  type HrInvitationVerification,
} from "../apps/api/src/hr-invitation-rules.js";

const valid: HrInvitationVerification = {
  state: "SENT",
  inviteEmail: "new-admin@example.invalid",
  confirmedEmail: "NEW-ADMIN@example.invalid",
  providerSubject: "e4b703d5-bf2c-4555-bfb1-6e63d452af3a",
  invitedSubject: "e4b703d5-bf2c-4555-bfb1-6e63d452af3a",
  freshInvitationIdentity: true,
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
    { freshInvitationIdentity: false }, { freshInvitationIdentity: undefined },
    { emailVerified: false }, { mfaVerified: false },
    { assuranceLevel: "aal1" }, { confirmedEmail: null },
    { confirmedEmail: "attacker@example.invalid" }, { providerSubject: null },
    { invitedSubject: null }, { invitedSubject: "cbfab129-8d44-4ed3-82a2-d026b09fe902" },
  ];
  for (const patch of denials) {
    assert.equal(canAcceptHrInvitation({ ...valid, ...patch }), false, JSON.stringify(patch));
  }
});
test("read-only identity proof cannot authorize HR role without trusted creation provenance", () => {
  const { freshInvitationIdentity: _ignored, ...identity } = valid;
  assert.equal(canVerifyHrInvitationIdentity(identity), true);
  assert.equal(canAcceptHrInvitation(identity), false);
  assert.equal(canAcceptHrInvitation({ ...identity, freshInvitationIdentity: false }), false);
  assert.equal(canAcceptHrInvitation({ ...identity, freshInvitationIdentity: true }), true);
});

test("HR invitation transitions fail closed", () => {
  assert.equal(canQueueHrInvitation("DRAFT"), true);
  assert.equal(canQueueHrInvitation("SENT"), false);
  assert.equal(canRevokeHrInvitation("QUEUED"), true);
  assert.equal(canRevokeHrInvitation("ACCEPTED"), false);
  assert.equal(canRevokeHrInvitation("REVOKED"), false);
});
