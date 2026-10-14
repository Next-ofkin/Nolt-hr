// One-time bootstrap through the authenticated CLI when direct PostgreSQL is unavailable.
// Existing Prisma SQL and exact byte checksums remain the single migration history.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parse } from "dotenv";

const ref = "llslubzdkdnvhbatmfug";
const cli = process.env.SUPABASE_CLI;
if (!cli) throw new Error("Set SUPABASE_CLI to the installed CLI executable.");
if (readFileSync("supabase/.temp/project-ref", "utf8").trim() !== ref)
  throw new Error("The CLI is not linked to the approved project.");
const envPath = resolve(".env.supabase");
const envText = readFileSync(envPath, "utf8");
if (parse(envText).SUPABASE_PROJECT_REF !== ref)
  throw new Error("Hosted environment project mismatch.");
if (parse(envText).DATABASE_URL)
  throw new Error(
    "Runtime credentials already exist. Bootstrap is one-time; do not overwrite them.",
  );
const tables = [
  "User",
  "Session",
  "Form",
  "FormVersion",
  "AuditEvent",
  "OutboxEvent",
  "Identity",
  "OidcAttempt",
];
const migrations = readdirSync("database/migrations", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
if (migrations.length !== 3)
  throw new Error("Review bootstrap for the current migration set.");
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
const password = randomBytes(32).toString("base64url");
const pooler = new URL(
  readFileSync("supabase/.temp/pooler-url", "utf8").trim(),
);
if (!decodeURIComponent(pooler.username).endsWith("." + ref))
  throw new Error("Pooler target mismatch.");
pooler.username = "nolt_app." + ref;
pooler.password = password;
pooler.searchParams.set("sslmode", "verify-full");
let sql = `BEGIN;
SET LOCAL search_path = public;
SET LOCAL timezone = 'UTC';
SELECT pg_advisory_xact_lock(71813001);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public') THEN
  RAISE EXCEPTION 'Bootstrap requires an empty public schema; no existing tables will be changed';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='nolt_app') THEN
  RAISE EXCEPTION 'Runtime role already exists; manual review required';
 END IF;
END $$;
CREATE TABLE public._prisma_migrations (
 id VARCHAR(36) PRIMARY KEY,
 checksum VARCHAR(64) NOT NULL,
 finished_at TIMESTAMPTZ,
 migration_name VARCHAR(255) NOT NULL,
 logs TEXT,
 rolled_back_at TIMESTAMPTZ,
 started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 applied_steps_count INTEGER NOT NULL DEFAULT 0
);
`;
for (const name of migrations) {
  const bytes = readFileSync(
    resolve("database/migrations", name, "migration.sql"),
  );
  const checksum = createHash("sha256").update(bytes).digest("hex");
  sql += "\n" + bytes.toString("utf8") + "\n";
  sql += `INSERT INTO public._prisma_migrations (id,checksum,migration_name,finished_at,applied_steps_count)
VALUES (${quote(randomUUID())},${quote(checksum)},${quote(name)},now(),1);\n`;
}
sql += `CREATE ROLE nolt_app LOGIN PASSWORD ${quote(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO nolt_app;
`;
for (const name of [...tables, "_prisma_migrations"]) {
  sql += `ALTER TABLE public."${name}" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."${name}" FROM PUBLIC, anon, authenticated, service_role;
`;
  // The backend handles application user/record authorisation. Public API roles get no policies.
  if (name !== "_prisma_migrations")
    sql += `CREATE POLICY nolt_backend ON public."${name}" TO nolt_app USING (true) WITH CHECK (true);\n`;
}
sql += `GRANT SELECT ON public."User", public."Identity" TO nolt_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."Session", public."OidcAttempt" TO nolt_app;
GRANT SELECT,INSERT,UPDATE ON public."Form", public."FormVersion" TO nolt_app;
GRANT SELECT,INSERT ON public."AuditEvent", public."OutboxEvent" TO nolt_app;
ALTER FUNCTION public.protect_published_form() SET search_path = public;
ALTER FUNCTION public.bump_user_access_version() SET search_path = public;
REVOKE ALL ON FUNCTION public.protect_published_form(), public.bump_user_access_version() FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
SELECT migration_name,checksum,finished_at IS NOT NULL AS applied FROM public._prisma_migrations ORDER BY migration_name;
`;
mkdirSync(".local", { recursive: true });
const file = resolve(".local/supabase-bootstrap.sql");
// Persist credentials before execution so a successful transaction is recoverable after interruption.
const nextEnv = envText.replace(
  /^DATABASE_URL=.*$/m,
  "DATABASE_URL=" + JSON.stringify(pooler.toString()),
);
writeFileSync(envPath, nextEnv, { mode: 0o600 });
writeFileSync(file, sql, { mode: 0o600 });
try {
  const result = spawnSync(
    cli,
    ["db", "query", "--linked", "--file", file, "--output", "json"],
    { encoding: "utf8", windowsHide: true },
  );
  const output = ((result.stdout ?? "") + (result.stderr ?? "")).replaceAll(
    password,
    "[REDACTED]",
  );
  console.log(output);
  if (result.error || result.status !== 0)
    throw new Error(
      "Bootstrap failed. Check remote state before retrying; do not reset the database.",
    );
  console.log(
    "Bootstrap completed; restricted runtime credentials saved in ignored .env.supabase. App connectivity still needs verified TLS.",
  );
} finally {
  unlinkSync(file);
}
