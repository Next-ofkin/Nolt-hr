import assert from "node:assert/strict";
import test from "node:test";
import { HrInvitationExchangeService } from "../apps/api/src/hr-invitation-exchange.js";
import { AuthController } from "../apps/api/src/auth.js";

const invitationId = "e4b703d5-bf2c-4555-bfb1-6e63d452af3a";
const subject = "cbfab129-8d44-4ed3-82a2-d026b09fe902";
const otherSubject = "b8d2b138-4cbb-47ea-bc5d-c8b0a35f13fc";
const email = "hr-candidate@example.invalid";
const input = { invitationId, proof: { access_token: "synthetic-access", refresh_token: "synthetic-refresh" } };
const forbidden = () => { throw Error("Blocked route must never open an MFA flow or application session"); };
const isForbidden = (error: unknown) =>
  Boolean(error && typeof error === "object" && "status" in error && error.status === 403);

async function withAcceptance<T>(action: () => Promise<T>): Promise<T> {
  const original = process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
  process.env.HR_INVITATION_ACCEPTANCE_ENABLED = "true";
  try { return await action(); }
  finally {
    if (original === undefined) delete process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
    else process.env.HR_INVITATION_ACCEPTANCE_ENABLED = original;
  }
}

test("onboarding integration refuses mismatched provider identity before creating HR flow", async () => withAcceptance(async () => {
  let starts = 0;
  const db = {
    hrInvitation: { findUnique: async () => ({ id: invitationId, email, state: "SENT",
      expiresAt: new Date(Date.now()+60000), revokedAt: null,
      providerSubject: subject, creationSubject: subject }) },
  };
  const auth = {
    authenticated: async () => ({ user: { id: otherSubject, email }, session: {} }),
    start: async () => { starts++; forbidden(); },
  };
  const svc = new HrInvitationExchangeService(db as never, auth as never, {} as never);
  await assert.rejects(svc.exchange(input, {} as never, {} as never), isForbidden);
  assert.equal(starts, 0);
}));

test("onboarding integration refuses already assigned employee before creating HR flow", async () => withAcceptance(async () => {
  let starts = 0;
  const db = {
    hrInvitation: { findUnique: async () => ({ id: invitationId, email, state: "SENT",
      expiresAt: new Date(Date.now()+60000), revokedAt: null,
      providerSubject: subject, creationSubject: subject }) },
    user: { findUnique: async () => ({ id: subject, role: "EMPLOYEE", active: true }) },
    employee: { findFirst: async () => ({ id: "already-assigned" }) },
  };
  const auth = {
    authenticated: async () => ({ user: { id: subject, email }, session: {} }),
    start: async () => { starts++; forbidden(); },
  };
  const svc = new HrInvitationExchangeService(db as never, auth as never, {} as never);
  await assert.rejects(svc.exchange(input, {} as never, {} as never), isForbidden);
  assert.equal(starts, 0);
}));

test("onboarding integration rejects revoked invitation without provider calls or MFA", async () => withAcceptance(async () => {
  let providerCalls = 0;
  const db = { hrInvitation: { findUnique: async () => ({
    id: invitationId, email, state: "REVOKED", expiresAt: new Date(Date.now()+60000),
    revokedAt: new Date(), providerSubject: subject, creationSubject: subject,
  }) } };
  const auth = { authenticated: async () => { providerCalls++; forbidden(); }, start: forbidden };
  const svc = new HrInvitationExchangeService(db as never, auth as never, {} as never);
  await assert.rejects(svc.exchange(input, {} as never, {} as never), isForbidden);
  assert.equal(providerCalls, 0);
}));

test("HR invitation MFA completion never issues a NOLT workspace session", async () => {
  const controller = new AuthController(
    { issue: forbidden } as never,
    { verify: async () => ({ hrInvitation: true }) } as never,
  );
  const req = { socket: { remoteAddress: "127.0.0.1" }, headers: {} };
  const result = await controller.verify({ factorId: invitationId, code: "123456" }, req as never, {} as never);
  assert.deepEqual(result, { next: "hr_invitation" });
});
