import test from "node:test";
import assert from "node:assert/strict";
import {
  databaseFailureCodes,
  databaseReadiness,
} from "../apps/api/src/database-diagnostics.js";

test("database diagnostics classify nested Prisma/driver failures without logging sensitive fields", () => {
  const secret = "postgresql://private-user:private-password@private-host/db";
  const error = {
    code: "P2010",
    message: secret,
    stack: secret,
    meta: {
      query: secret,
      driverAdapterError: {
        cause: {
          originalCode: "28P01",
          originalMessage: secret,
          kind: "AuthenticationFailed",
          user: secret,
        },
      },
    },
  };
  const summary = databaseFailureCodes(error);
  assert.deepEqual(summary.codes, ["P2010", "28P01"]);
  assert.deepEqual(summary.kinds, ["AuthenticationFailed"]);
  assert.equal(JSON.stringify(summary).includes(secret), false);
  assert.deepEqual(
    databaseFailureCodes({ code: secret, kind: secret, message: secret }),
    { codes: [], kinds: [], classified: false },
  );
  const cyclic: { cause?: unknown; code: string } = { code: "ENOENT" };
  cyclic.cause = cyclic;
  assert.deepEqual(databaseFailureCodes(cyclic).codes, ["ENOENT"]);
});

test("readiness remains 503 on failure and returns ready only after a successful query", async () => {
  const logs: unknown[] = [];
  await assert.rejects(
    databaseReadiness(
      async () => {
        throw { code: "ETIMEDOUT", message: "private" };
      },
      (s) => logs.push(s),
    ),
    (e: { getStatus(): number; message: string }) =>
      e.getStatus() === 503 && e.message === "Database is unavailable.",
  );
  assert.deepEqual(logs, [
    { codes: ["ETIMEDOUT"], kinds: [], classified: true },
  ]);
  logs.length = 0;
  assert.deepEqual(
    await databaseReadiness(
      async () => 1,
      (s) => logs.push(s),
    ),
    { status: "ready" },
  );
  assert.equal(logs.length, 0);
});
