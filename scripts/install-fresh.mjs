// One-time install of the NOLT HR database on a NEW, EMPTY Supabase project.
//
//   OWNER_DATABASE_URL  the project's Session pooler address for the owner user (postgres.<project id>)
//   SUPABASE_URL        https://<project id>.supabase.co
//   SUPABASE_SECRET_KEY the project's secret key (only used to create the private file bucket)
//   BOOTSTRAP_HR_EMAIL  the first HR administrator; this exact email becomes HR once it is verified
//
// It refuses to run on a database that already has tables, never prints a password to the screen
// and writes the restricted app connection address to .local/nolt-app-database-url.txt (mode 600).
// INSTALL_REHEARSAL=1 is for tests on a throwaway database that imitates Supabase.
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

const root = resolve(import.meta.dirname, "..");
const OLD_REF = "llslubzdkdnvhbatmfug"; // the project the migrations were first written against
const env = process.env;
const rehearsal = env.INSTALL_REHEARSAL === "1";
const step = (n, text) => console.log(`\n[${n}/9] ${text}`);
const fail = (msg) => { throw new Error(msg); };

const supabaseUrl = env.SUPABASE_URL ?? "";
const ref = /^https:\/\/([a-z0-9]{20})\.supabase\.co$/.exec(supabaseUrl)?.[1] ?? fail("SUPABASE_URL must look like https://<20-character project id>.supabase.co");
const issuer = `${supabaseUrl}/auth/v1`;
const oldIssuer = `https://${OLD_REF}.supabase.co/auth/v1`;
const hrEmail = (env.BOOTSTRAP_HR_EMAIL ?? "").trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(hrEmail)) fail("Set BOOTSTRAP_HR_EMAIL to the first HR administrator's email.");
const ownerUrl = env.OWNER_DATABASE_URL ?? fail("Set OWNER_DATABASE_URL.");
const owner = new URL(ownerUrl);
if (!rehearsal) {
  if (!owner.hostname.endsWith(".pooler.supabase.com") || !decodeURIComponent(owner.username).endsWith("." + ref))
    fail("OWNER_DATABASE_URL must be this project's Session pooler address with user postgres." + ref);
  if (!env.SUPABASE_SECRET_KEY) fail("Set SUPABASE_SECRET_KEY (used only to create the private file bucket).");
}
const appPassword = env.NOLT_APP_PASSWORD || randomBytes(32).toString("base64url");
const quote = (v) => "'" + v.replaceAll("'", "''") + "'";
const db = new pg.Client({ connectionString: ownerUrl, options: "-c timezone=UTC", connectionTimeoutMillis: 20000 });
await db.connect();
try {
  step(1, "Checking the database is new and empty");
  const tables = (await db.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n;
  if (tables > 0) fail("The public schema already has tables. This installer is only for an empty project. Nothing was changed.");
  if ((await db.query("SELECT 1 FROM pg_roles WHERE rolname='nolt_app'")).rowCount) fail("The nolt_app role already exists. Nothing was changed.");
  if (!(await db.query("SELECT to_regclass('auth.users') AS t")).rows[0].t) fail("auth.users was not found. Use a Supabase project.");

  step(2, "Creating the restricted app role (it can never change users, roles or audit records)");
  await db.query(`CREATE ROLE nolt_app LOGIN PASSWORD ${quote(appPassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  await db.query("GRANT USAGE ON SCHEMA public TO nolt_app");
  // Hosted Supabase lets the owner role grant to it; a plain Postgres needs membership for later checks.

  step(3, "Applying every database migration, in order");
  const prisma = spawnSync(process.execPath, [resolve(root, "node_modules/prisma/build/index.js"), "migrate", "deploy", "--config", "database/prisma.config.ts"], {
    cwd: root, env: { ...env, DIRECT_DATABASE_URL: ownerUrl }, encoding: "utf8",
  });
  const out = ((prisma.stdout ?? "") + (prisma.stderr ?? "")).replaceAll(appPassword, "[hidden]").replaceAll(decodeURIComponent(owner.password) || appPassword, "[hidden]");
  console.log(out.trim().split("\n").slice(-6).join("\n"));
  if (prisma.status !== 0) fail("Migrations failed. Read the message above. The database may be half-installed: delete the project and start again.");

  step(4, "Adding the Supabase sign-in hooks and the first-HR rule for " + hrEmail);
  const sql = (file) => readFileSync(resolve(root, "database", file), "utf8").replaceAll(oldIssuer, issuer);
  await db.query(sql("supabase-auth-provisioning.sql"));
  await db.query("INSERT INTO nolt_private.bootstrap_hr(email) VALUES ($1) ON CONFLICT(email) DO NOTHING", [hrEmail]);
  await db.query(sql("supabase-employee-linking.sql"));
  if ((await db.query("SELECT to_regprocedure('public.rls_auto_enable()') AS f")).rows[0].f)
    await db.query(sql("supabase-api-hardening.sql"));

  step(5, "Setting what the app's database user may do (matches the live system)");
  await db.query(readFileSync(resolve(root, "database/hosted-backend-access.sql"), "utf8"));

  step(6, "Pointing the database functions at THIS project (they were first written for another one)");
  const stale = await db.query(
    `SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname IN ('public','nolt_private') AND p.prosrc LIKE '%' || $1 || '%'`, [OLD_REF]);
  for (const { def } of stale.rows) await db.query(def.replaceAll(oldIssuer, issuer));
  const left = (await db.query(
    `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname IN ('public','nolt_private') AND p.prosrc LIKE '%' || $1 || '%'`, [OLD_REF])).rows[0].n;
  if (left) fail(`${left} database function(s) still mention the old project. Stop and ask the developer.`);
  console.log(`Updated ${stale.rowCount} function(s).`);

  step(7, "Checking security rules");
  // Supabase normally switches row-level security on for every new table by itself. If the project
  // was created without that option, do it here so nothing is ever exposed to the public API.
  const noRls = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity")).rows;
  for (const { tablename } of noRls) {
    await db.query(`ALTER TABLE public."${tablename}" ENABLE ROW LEVEL SECURITY`);
    await db.query(`REVOKE ALL ON TABLE public."${tablename}" FROM PUBLIC, anon, authenticated, service_role`);
  }
  if (noRls.length) console.log(`Switched row-level security on for ${noRls.length} table(s) the platform had not covered.`);
  await db.query(readFileSync(resolve(root, "database/verify-supabase.sql"), "utf8"));
  console.log("Row-level security, grants and the frozen-form rule are in place.");

  step(8, "Creating the private file bucket");
  if (rehearsal) console.log("Skipped in rehearsal.");
  else {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(supabaseUrl, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const bucket = "nolt-private-documents";
    const { data: list, error: e1 } = await client.storage.listBuckets();
    if (e1) fail("Could not reach Supabase Storage. Check SUPABASE_SECRET_KEY.");
    const found = list.find((b) => b.id === bucket);
    if (found?.public) fail("A bucket with that name exists and is public. Refusing to use it.");
    if (!found) {
      const { error } = await client.storage.createBucket(bucket, { public: false, fileSizeLimit: 10485760, allowedMimeTypes: ["application/pdf", "image/png", "image/jpeg"] });
      if (error) fail("Private bucket creation failed.");
    }
    console.log("Bucket nolt-private-documents exists and is private.");
  }

  step(9, "Saving the app's database address");
  const app = new URL(ownerUrl);
  app.username = rehearsal ? "nolt_app" : "nolt_app." + ref;
  app.password = appPassword;
  if (!rehearsal) app.searchParams.set("sslmode", "verify-full");
  mkdirSync(resolve(root, ".local"), { recursive: true });
  const file = resolve(root, ".local/nolt-app-database-url.txt");
  writeFileSync(file, app.toString() + "\n", { mode: 0o600 });
  console.log("Saved to " + file);
  console.log("\nDONE. Paste that line into .env.api as DATABASE_URL on the server, then delete the file.");
} finally {
  await db.end().catch(() => {});
}
