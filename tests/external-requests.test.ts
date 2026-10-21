import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createExternalSchema,
  externalExchangeSchema,
  ExternalRequestsService,
} from "../apps/api/dist/external-requests.js";

test("expired and revoked request links fail before any provider proof is accepted", async () => {
  for (const row of [
    { state: "SENT", expiresAt: new Date(Date.now() - 1000), revokedAt: null },
    {
      state: "REVOKED",
      expiresAt: new Date(Date.now() + 60000),
      revokedAt: new Date(),
    },
  ]) {
    const service = new ExternalRequestsService(
      { externalRequest: { findUnique: async () => row } } as never,
      {
        authenticated: () =>
          assert.fail("Expired links must not reach provider verification"),
        client: () =>
          assert.fail("Revoked links must not reach provider verification"),
      } as never,
      {} as never,
    );
    await assert.rejects(
      service.exchange(
        {
          requestId: randomUUID(),
          proof: { tokenHash: "a".repeat(64), type: "magiclink" },
        },
        {} as never,
        {} as never,
      ),
      (e: any) => e.getStatus() === 403,
    );
  }
});
test("a send carries the name, email and slot, and rejects actor or recipient overrides", () => {
  const p = { requestKey: randomUUID(), slot: 1, fullName: "Ada Obi", email: "Ada@Example.com" };
  const ok = createExternalSchema.safeParse(p);
  assert.equal(ok.success, true);
  assert.equal(ok.success && ok.data.email, "ada@example.com");
  for (const bad of [{ slot: 0 }, { slot: 3 }, { email: "not-an-email" }, { fullName: "  " }])
    assert.equal(createExternalSchema.safeParse({ ...p, ...bad }).success, false);
  for (const override of [
    { respondentId: randomUUID() },
    { assignmentId: randomUUID() },
    { expectedContactRevision: 1 },
  ])
    assert.equal(createExternalSchema.safeParse({ ...p, ...override }).success, false);
});
test("external exchange requires a bounded provider proof and rejects fabricated identity fields", () => {
  const p = {
    requestId: randomUUID(),
    proof: { tokenHash: "a".repeat(64), type: "magiclink" },
  };
  assert.equal(externalExchangeSchema.safeParse(p).success, true);
  assert.equal(
    externalExchangeSchema.safeParse({
      ...p,
      proof: { ...p.proof, type: "recovery" },
    }).success,
    false,
  );
  assert.equal(
    externalExchangeSchema.safeParse({
      ...p,
      proof: { ...p.proof, tokenHash: "a".repeat(20000) },
    }).success,
    false,
  );
  assert.equal(
    externalExchangeSchema.safeParse({ ...p, userId: randomUUID() }).success,
    false,
  );
});
