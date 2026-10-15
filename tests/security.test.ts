import test from "node:test";
import assert from "node:assert/strict";
import {
  appOrigin,
  cookieName,
  LoginLimiter,
  permissionsFor,
} from "../apps/api/src/security.js";
test("Role grants separate technical administration and sensitive HR access", () => {
  assert.deepEqual(permissionsFor({ role: "SYSTEM_ADMIN", permissions: [] }), [
    "system.manage",
  ]);
  assert.equal(
    permissionsFor({ role: "HR", permissions: [] }).includes("health.read"),
    false,
  );
  assert.equal(
    permissionsFor({
      role: "HR_REVIEWER",
      permissions: ["forms.manage", "health.read", "arbitrary"],
    }).includes("forms.manage"),
    false,
  );
  assert.deepEqual(
    permissionsFor({ role: "HR_REVIEWER", permissions: ["health.read"] }),
    ["reviews.assigned", "health.read"],
  );
});
test("Production cookies use host prefix and configuration rejects HTTP origins", () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
    LOCAL_DEVELOPMENT: process.env.LOCAL_DEVELOPMENT,
  };
  try {
    process.env.NODE_ENV = "production";
    process.env.LOCAL_DEVELOPMENT = "false";
    process.env.PUBLIC_APP_URL = "http://127.0.0.1:3000";
    assert.throws(appOrigin, /HTTPS/);
    process.env.PUBLIC_APP_URL = "https://hr.example.test";
    assert.equal(appOrigin(), "https://hr.example.test");
    assert.equal(cookieName("session"), "__Host-nolt_session");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
test("Sign-in throttling is bounded and expires", () => {
  const limiter = new LoginLimiter(2);
  limiter.take("local", 0);
  limiter.take("local", 1);
  assert.throws(() => limiter.take("local", 2), /Too many/);
  assert.doesNotThrow(() => limiter.take("local", 60001));
});

test("developer can administer HR accounts without accessing employee or sensitive HR data", () => {
  const grants = permissionsFor({ role: "DEVELOPER", permissions: [] });
  assert.deepEqual(grants, ["system.manage", "hr.accounts.manage"]);
  for (const forbidden of ["forms.manage", "employees.manage", "reviews.assigned", "health.read", "finance.read"])
    assert.equal(grants.includes(forbidden), false);
});
