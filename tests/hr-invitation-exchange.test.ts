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
