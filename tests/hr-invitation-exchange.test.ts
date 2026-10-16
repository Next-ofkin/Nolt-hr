import assert from "node:assert/strict";
import test from "node:test";
import { HrInvitationExchangeService } from "../apps/api/src/hr-invitation-exchange.js";

test("HR recipient exchange is fail-closed before DB or Supabase access", async () => {
  const old = process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
  delete process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
  try {
    const unavailable = new Proxy({}, { get() { throw Error("Unexpected external dependency access"); } });
    const service = new HrInvitationExchangeService(unavailable as never, unavailable as never);
    await assert.rejects(service.exchange({}), (e: unknown) =>
      Boolean(e && typeof e === "object" && "status" in e && e.status === 503));
  } finally {
    if (old === undefined) delete process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
    else process.env.HR_INVITATION_ACCEPTANCE_ENABLED = old;
  }
});

test("matching HR recipient starts only the dedicated MFA flow", async () => {
  const old = process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
  process.env.HR_INVITATION_ACCEPTANCE_ENABLED = "true";
  const id = "e4b703d5-bf2c-4555-bfb1-6e63d452af3a";
  const subject = "cbfab129-8d44-4ed3-82a2-d026b09fe902";
  const email = "new-hr@example.invalid";
  const record: { started?: unknown[] } = {};
  const db = {
    hrInvitation: { findUnique: async () => ({
      id, email, state: "SENT", expiresAt: new Date(Date.now() + 180_000),
      revokedAt: null, creationSubject: subject, providerSubject: subject,
    }) },
    user: { findUnique: async () => ({ id: subject, role: "EMPLOYEE", active: true }) },
    employee: { findFirst: async () => null },
  };
  const auth = {
    authenticated: async () => ({
      session: { access_token: "access", refresh_token: "refresh" },
      user: { id: subject, email, email_confirmed_at: new Date().toISOString() },
    }),
    tokens: (v: unknown) => v,
    start: async (...args: unknown[]) => { record.started = args; return { next: "mfa" }; },
  };
  try {
    const service = new HrInvitationExchangeService(db as never, auth as never);
    const result = await service.exchange(
      { invitationId: id, proof: { access_token: "access", refresh_token: "refresh" } },
      { headers: {} } as never, {} as never,
    );
    assert.deepEqual(result, { next: "mfa" });
    assert.ok(record.started);
    assert.equal(record.started[0], "HR_INVITATION");
    assert.deepEqual((record.started[1] as { invitationId: string }).invitationId, id);
    assert.ok((record.started[4] as number) > 0);
    assert.ok((record.started[4] as number) <= 180_000);
  } finally {
    if (old === undefined) delete process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
    else process.env.HR_INVITATION_ACCEPTANCE_ENABLED = old;
  }
});
