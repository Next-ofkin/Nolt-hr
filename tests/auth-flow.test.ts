import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { SupabaseAuth } from "../apps/api/dist/supabase-auth.js";

test("sign-in flow storage uses bounded transaction time and issues no cookie on expiration", async () => {
  let cookieIssued = false;
  const db = {
    async $transaction(_work: unknown, options: unknown) {
      assert.deepEqual(options, { timeout: 15000, maxWait: 10000 });
      throw new Prisma.PrismaClientKnownRequestError(
        "internal database detail",
        { code: "P2028", clientVersion: "test" },
      );
    },
  };
  const auth = new SupabaseAuth(db as never);
  await assert.rejects(
    auth.start(
      "MFA",
      {},
      { headers: {} } as never,
      {
        cookie() {
          cookieIssued = true;
        },
      } as never,
    ),
    (error: any) =>
      error.getStatus() === 503 &&
      !error.message.includes("internal database detail"),
  );
  assert.equal(cookieIssued, false);
});
