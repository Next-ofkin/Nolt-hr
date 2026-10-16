import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("pending HR activation migration uses valid PL/pgSQL dollar quoting", () => {
  const sql = readFileSync("database/migrations/20261016120000_hr_invitation_lifecycle/migration.sql", "utf8");
  const declaration = sql.match(/CREATE OR REPLACE FUNCTION nolt_private\.accept_hr_invitation\([\s\S]*?LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS (\$\$|\$[a-zA-Z_][a-zA-Z_0-9]*\$)/);
  assert.ok(declaration, "Activation function must use a valid PostgreSQL dollar-quote delimiter.");
  const delimiter = declaration[1];
  const suffix = sql.slice(sql.indexOf(declaration[0]) + declaration[0].length);
  assert.ok(suffix.includes("END " + delimiter + ";"), "Activation function must close the same delimiter.");
  assert.ok(suffix.includes("REVOKE ALL ON FUNCTION nolt_private.accept_hr_invitation"), "Activation function must remain inaccessible to runtime.");
});
