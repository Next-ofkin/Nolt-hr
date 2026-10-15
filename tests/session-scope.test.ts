import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  newSessionToken,
  sessionTokenMatchesScope,
} from "../apps/api/dist/sessions.js";
import { digest } from "../apps/api/dist/security.js";
test("scoped sessions are rejected by legacy APIs and cannot be downgraded by stripping their prefix", () => {
  const scope = randomUUID(),
    scoped = newSessionToken(scope),
    ordinary = newSessionToken();
  assert.equal(/^[a-f0-9]{64}$/.test(ordinary), true);
  assert.equal(/^[a-f0-9]{64}$/.test(scoped), false);
  assert.equal(sessionTokenMatchesScope(scoped, scope), true);
  assert.equal(sessionTokenMatchesScope(scoped, null), false);
  assert.equal(sessionTokenMatchesScope(ordinary, scope), false);
  assert.equal(sessionTokenMatchesScope(ordinary, null), true);
  assert.notEqual(digest(scoped), digest(scoped.slice("external_".length)));
  assert.notEqual(newSessionToken(scope), scoped);
});
