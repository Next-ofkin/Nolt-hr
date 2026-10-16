import assert from "node:assert/strict";
import test from "node:test";
import { hrActivationPreflight, validateOfflineActivationEnvironment } from "../scripts/hr-activation-preflight.mjs";

const invitation = "e4b703d5-bf2c-4555-bfb1-6e63d452af3a";
const subject = "cbfab129-8d44-4ed3-82a2-d026b09fe902";
const flow = "fa9a6375-21df-4219-8098-7278010222d3";

test("offline activation preflight rejects missing owner and malformed references", () => {
  assert.throws(() => validateOfflineActivationEnvironment({}, [invitation, subject, flow]));
  assert.throws(() => validateOfflineActivationEnvironment({
    DIRECT_DATABASE_URL: "test", SUPABASE_PROJECT_REF: "llslubzdkdnvhbatmfug",
  }, ["not-an-id", subject, flow]));
});

test("offline activation preflight never authorizes promotion, even with matching database evidence", async () => {
  const now = Date.now();
  let calls = 0;
  const db = { query: async (_query: string, params: string[]) => {
    calls++;
    assert.deepEqual(params, [invitation, subject, flow]);
    return { rows: [{
      id: invitation, state: "SENT", email: "new-hr@example.invalid",
      expiresAt: new Date(now + 60_000), revokedAt: null,
      creationSubject: subject, providerSubject: subject,
      userId: subject, role: "EMPLOYEE", active: true, authVersion: 1,
      flowId: flow, flowKind: "HR_INVITATION",
      hrInvitationId: invitation, hrSubject: subject,
      hrPasswordConfirmedAt: new Date(now - 15_000),
      flowCreatedAt: new Date(now - 30_000), flowExpiresAt: new Date(now + 60_000),
    }] };
  } };
  const result = await hrActivationPreflight(db as never, invitation, subject, flow);
  assert.deepEqual(result, { databasePrerequisitesMet: true, providerAal2Verified: false, activationAllowed: false });
  assert.equal(calls, 1);
});

test("offline activation preflight fails closed for a mismatched identity", async () => {
  const db = { query: async () => ({ rows: [{
    state: "SENT", expiresAt: new Date(Date.now() + 60_000),
    creationSubject: "someone-else", providerSubject: subject,
  }] }) };
  assert.deepEqual(await hrActivationPreflight(db as never, invitation, subject, flow),
    { databasePrerequisitesMet: false, providerAal2Verified: false, activationAllowed: false });
});
