import assert from "node:assert/strict";
import test from "node:test";
import { HrInvitationWorker } from "../apps/api/src/hr-invitation-worker.js";

test("HR worker does not access database or provider without the explicit delivery gate", async () => {
  const old = process.env.HR_INVITATION_DELIVERY_ENABLED;
  delete process.env.HR_INVITATION_DELIVERY_ENABLED;
  try {
    const unavailable = new Proxy({}, {get: () => {throw Error("Worker accessed live dependency while disabled.");}});
    const worker = new HrInvitationWorker(unavailable as never, unavailable as never);
    assert.equal(await worker.deliverNext(), false);
  } finally {
    if (old === undefined) delete process.env.HR_INVITATION_DELIVERY_ENABLED;
    else process.env.HR_INVITATION_DELIVERY_ENABLED = old;
  }
});
