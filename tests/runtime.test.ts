import test from "node:test";
import assert from "node:assert/strict";
import { runtimeSettings } from "../apps/api/src/runtime.js";

function staging(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    DEPLOYMENT_ENV: "staging",
    LOCAL_DEVELOPMENT: "false",
    PORT: "8080",
    PUBLIC_APP_URL: "https://web.example.test",
    AUTH_PROVIDER: "supabase",
    SUPABASE_PROJECT_REF: "llslubzdkdnvhbatmfug",
    SUPABASE_URL: "https://llslubzdkdnvhbatmfug.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "test-publishable",
    SUPABASE_SECRET_KEY: "test-server-key",
    AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    DATABASE_URL:
      "postgresql://nolt_app.example:fixture@pool.example.test/db?sslmode=verify-full&sslrootcert=database/certs/ca.crt",
  };
}
test("hosted staging binds the platform port and preserves the production release gate", () => {
  assert.deepEqual(runtimeSettings({}), { host: "127.0.0.1", port: 4000 });
  assert.deepEqual(runtimeSettings(staging()), { host: "0.0.0.0", port: 8080 });
  assert.throws(
    () => runtimeSettings({ NODE_ENV: "production" }),
    /not enabled/,
  );
  assert.throws(() => runtimeSettings({ PORT: "invalid" }), /port/);
});
test("hosted staging rejects unsafe auth, origins, owner connections and unverified TLS", () => {
  for (const change of [
    { PUBLIC_APP_URL: "http://localhost:3000" },
    { LOCAL_DEVELOPMENT: "true" },
    { AUTH_PROVIDER: "synthetic" },
    { AUTH_ENCRYPTION_KEY: "invalid" },
    {
      DATABASE_URL:
        "postgresql://postgres.example:fixture@pool.example.test/db?sslmode=verify-full&sslrootcert=ca.crt",
    },
    {
      DATABASE_URL:
        "postgresql://nolt_app.example:fixture@pool.example.test/db?sslmode=require",
    },
    { SUPABASE_PROJECT_REF: "unapproved" },
  ])
    assert.throws(() => runtimeSettings({ ...staging(), ...change }));
});
