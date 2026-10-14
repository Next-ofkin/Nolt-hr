import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { seal, unseal } from "../apps/api/src/auth-crypto.js";
test("provider credentials are encrypted with random nonces and reject tampering", () => {
  process.env.AUTH_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const value = {
    tokens: {
      access_token: "private-access-token",
      refresh_token: "private-refresh-token",
    },
  };
  const first = seal(value),
    second = seal(value);
  assert.notEqual(first, second);
  assert.ok(!first.includes("private"));
  assert.deepEqual(unseal(first), value);
  const pieces = first.split(".");
  const bytes = Buffer.from(pieces[3], "base64url");
  bytes[0] ^= 1;
  pieces[3] = bytes.toString("base64url");
  assert.throws(() => unseal(pieces.join(".")));
  process.env.AUTH_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  assert.throws(() => unseal(first));
});
