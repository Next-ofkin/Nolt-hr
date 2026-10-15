import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { databaseConnectionString } from "../apps/api/dist/database-connection.js";

test("compiled staging uses its bundled CA regardless of working directory or configured path", () => {
  const supplied =
    "postgresql://nolt_app.fixture:fixture@pool.example.test:5432/postgres?sslmode=verify-full&sslrootcert=C%3A%5Cmissing.crt";
  const result = new URL(
    databaseConnectionString({
      DATABASE_URL: supplied,
      DEPLOYMENT_ENV: "staging",
    }),
  );
  const ca = result.searchParams.get("sslrootcert")!;
  assert.match(
    ca.replaceAll("\\", "/"),
    /apps\/api\/dist\/certs\/supabase-prod-ca-2021\.crt$/,
  );
  const hash = (bytes: Buffer) =>
    createHash("sha256").update(bytes).digest("hex");
  assert.equal(
    hash(readFileSync(ca)),
    hash(readFileSync("database/certs/supabase-prod-ca-2021.crt")),
  );
  assert.equal(result.searchParams.get("sslmode"), "verify-full");
  assert.equal(result.password, "fixture");
  assert.equal(result.hostname, "pool.example.test");
  assert.equal(databaseConnectionString({ DATABASE_URL: supplied }), supplied);
  assert.throws(
    () =>
      databaseConnectionString({
        DATABASE_URL: supplied.replace("verify-full", "require"),
        DEPLOYMENT_ENV: "staging",
      }),
    /verified TLS/,
  );
});
