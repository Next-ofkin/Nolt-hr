import assert from "node:assert/strict";
import test from "node:test";
import { seal } from "../apps/api/src/auth-crypto.js";
import { decodeHrFlow, validateRunnerEnvironment, verifyLiveHrProvider, runHrActivation } from "../scripts/hr-activation-runner.mjs";

const invitationId = "e4b703d5-bf2c-4555-bfb1-6e63d452af3a";
const subjectId = "cbfab129-8d44-4ed3-82a2-d026b09fe902";
const flowId = "fa9a6375-21df-4219-8098-7278010222d3";
const sessionId = "357f37cc-63f3-4c73-ae45-84ac74d1c58d";
const email = "new-hr@example.invalid";
const key = Buffer.alloc(32, 13).toString("base64");
const env = {
  DIRECT_DATABASE_URL: "postgres://postgres.llslubzdkdnvhbatmfug:example@operator.pooler.supabase.com:5432/postgres",
  SUPABASE_PROJECT_REF: "llslubzdkdnvhbatmfug",
  SUPABASE_URL: "https://llslubzdkdnvhbatmfug.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "synthetic", AUTH_ENCRYPTION_KEY: key,
};
const flow = { invitationId, hrSubject: subjectId, hrPasswordStatus: "CONFIRMED",
  tokens: { access_token: "synthetic", refresh_token: "synthetic" } };
const auth = { auth: {
  getUser: async () => ({ data: { user: { id: subjectId, email, email_confirmed_at: "yes",
    factors: [{ factor_type: "totp", status: "verified" }] } }, error: null }),
  getClaims: async () => ({ data: { claims: { sub: subjectId, aal: "aal2", session_id: sessionId } }, error: null }),
} };
function dbFixture() {
  const calls: string[] = [];
  const now = Date.now();
  const db = { query: async (sql: string, params?: unknown[]) => {
    calls.push(sql);
    if (sql === "BEGIN" || sql === "ROLLBACK" || sql === "COMMIT") return { rows: [] };
    if (sql.includes('LEFT JOIN public."User"')) return { rows: [{
      state: "SENT", email, expiresAt: new Date(now + 120000), revokedAt: null,
      creationSubject: subjectId, providerSubject: subjectId, userId: subjectId,
      role: "EMPLOYEE", active: true, authVersion: 1, flowId,
      flowKind: "HR_INVITATION", hrInvitationId: invitationId, hrSubject: subjectId,
      hrPasswordConfirmedAt: new Date(now - 5000),
      flowCreatedAt: new Date(now - 15000), flowExpiresAt: new Date(now + 120000),
    }] };
    if (sql.includes('SELECT "encryptedState"')) return { rowCount: 1, rows: [{ encryptedState: seal(flow) }] };
    if (sql.includes("FROM auth.sessions")) return { rows: [{ active: true }] };
    if (sql.includes('SELECT h.email')) return { rows: [{ email }] };
    if (sql.includes("accept_hr_invitation")) return { rows: [{ accepted: true }] };
    throw Error("Unexpected SQL");
  } };
  return { db, calls };
}
test("runner has a separate fail-closed apply gate", () => {
  assert.throws(() => validateRunnerEnvironment(env, [invitationId,subjectId,flowId], true));
  assert.deepEqual(validateRunnerEnvironment(env, [invitationId,subjectId,flowId], false),
    [invitationId,subjectId,flowId]);
});
test("operator flow rejects invalid encryption", () => {
  assert.throws(() => decodeHrFlow("forged", key));
});
test("live provider proof rejects wrong account and missing aal2", async () => {
  const { db } = dbFixture();
  await assert.rejects(verifyLiveHrProvider(auth as never, db as never,
    invitationId, subjectId, flowId, { ...flow, hrSubject: flowId }));
  const bad = { auth: { ...auth.auth, getClaims: async () => ({
    data: { claims: { sub: subjectId, aal: "aal1", session_id: sessionId } }, error: null,
  }) } };
  await assert.rejects(verifyLiveHrProvider(bad as never, db as never,
    invitationId, subjectId, flowId, flow));
});
test("runner dry-run never activates and always rolls back", async () => {
  const previous = process.env.AUTH_ENCRYPTION_KEY;
  process.env.AUTH_ENCRYPTION_KEY = key;
  try {
    const { db, calls } = dbFixture();
    const result = await runHrActivation({ db, auth, invitationId, subjectId, flowId,
      encryptionKey: key, apply: false, approve: undefined });
    assert.deepEqual(result, { databasePrerequisitesMet: true, providerAal2Verified: true, activated: false });
    assert.ok(calls.includes("ROLLBACK"));
    assert.equal(calls.some(sql => sql.includes("accept_hr_invitation")), false);
  } finally {
    if (previous === undefined) delete process.env.AUTH_ENCRYPTION_KEY;
    else process.env.AUTH_ENCRYPTION_KEY = previous;
  }
});
test("operator denial rolls back; approved activation invokes owner boundary once", async () => {
  const previous = process.env.AUTH_ENCRYPTION_KEY;
  process.env.AUTH_ENCRYPTION_KEY = key;
  try {
    const denied = dbFixture();
    await assert.rejects(runHrActivation({ db: denied.db, auth, invitationId, subjectId, flowId,
      encryptionKey: key, apply: true, approve: async () => false }));
    assert.ok(denied.calls.includes("ROLLBACK"));
    assert.equal(denied.calls.some(sql => sql.includes("accept_hr_invitation")), false);
    const approved = dbFixture();
    const result = await runHrActivation({ db: approved.db, auth, invitationId, subjectId, flowId,
      encryptionKey: key, apply: true, approve: async () => true });
    assert.equal(result.activated, true);
    assert.equal(approved.calls.filter(sql => sql.includes("accept_hr_invitation")).length, 1);
    assert.ok(approved.calls.includes("COMMIT"));
  } finally {
    if (previous === undefined) delete process.env.AUTH_ENCRYPTION_KEY;
    else process.env.AUTH_ENCRYPTION_KEY = previous;
  }
});
