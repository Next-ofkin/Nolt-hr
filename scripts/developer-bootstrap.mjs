// Offline, operator-only bootstrap. Never expose via NestJS routes.
// Default: read-only preflight. --apply requires a typed confirmation.
// This command intentionally does not create Supabase users or passwords.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import pg from "pg";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { normalizeApprovedEmail, assertEligibleDeveloper } from "./developer-bootstrap-policy.mjs";

const root = resolve(import.meta.dirname, "..");
const env = { ...process.env };
for (const name of [".env", ".env.supabase"]) {
  try { Object.assign(env, parse(readFileSync(resolve(root, name)))); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
const apply = process.argv.includes("--apply");
if (process.argv.some((a) => a.startsWith("--") && a !== "--apply"))
  throw new Error("Supported mode: dry-run (default), or --apply.");
const approvedEmail = normalizeApprovedEmail(env.DEVELOPER_BOOTSTRAP_EMAIL);
const approvedSubject = env.DEVELOPER_BOOTSTRAP_SUBJECT;
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(approvedSubject ?? ""))
  throw new Error("Set DEVELOPER_BOOTSTRAP_SUBJECT to the exact approved Supabase Auth user UUID.");
if (env.NODE_ENV === "production")
  throw new Error("Run the offline bootstrap from an approved operator workstation, not production runtime.");
if (!env.DIRECT_DATABASE_URL)
  throw new Error("DIRECT_DATABASE_URL (restricted-use migration owner) is required.");

const db = new pg.Client({
  connectionString: env.DIRECT_DATABASE_URL,
  connectionTimeoutMillis: 15000,
  options: "-c timezone=UTC",
});
const eligibilityQuery = `
SELECT
 u.id AS user_id, u.email AS app_email, u.role, u.active AS is_active,
 a.email AS auth_email, (a.email_confirmed_at IS NOT NULL) AS email_verified,
 EXISTS (
   SELECT 1 FROM auth.mfa_factors f
   WHERE f.user_id=a.id AND f.factor_type='totp' AND f.status='verified'
 ) AS has_verified_totp,
 EXISTS (
   SELECT 1 FROM public."Identity" i
   WHERE i."userId"=u.id AND i.subject=a.id::text
     AND i.issuer=(SELECT 'https://' || current_setting('nolt.bootstrap_project_ref') || '.supabase.co/auth/v1')
 ) AS identity_linked,
 EXISTS (SELECT 1 FROM public."Employee" e WHERE e."userId"=u.id) AS has_employee_record
FROM auth.users a JOIN public."User" u ON u.id=a.id
WHERE a.id=$1::uuid AND lower(a.email)=$2 AND lower(u.email)=$2
FOR UPDATE OF u
`;
try {
  await db.connect();
  const tls = db.connection.stream;
  if (!tls?.encrypted || !tls?.authorized)
    throw new Error("Owner connection must use authenticated TLS.");
  const role = (await db.query("SELECT current_user AS name, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
  if (!role || role.name === "nolt_app")
    throw new Error("An approved privileged database owner is required; never use nolt_app.");
  if (!/^[a-z0-9]{20}$/.test(env.SUPABASE_PROJECT_REF ?? ""))
    throw new Error("SUPABASE_PROJECT_REF must identify the approved Supabase project.");
  const host = new URL(env.DIRECT_DATABASE_URL).hostname;
  if (!host.endsWith(".pooler.supabase.com"))
    throw new Error("The approved hosted Supabase pooler is required.");
  await db.query("BEGIN");
  try {
    await db.query("SELECT set_config('nolt.bootstrap_project_ref', $1, true)", [env.SUPABASE_PROJECT_REF]);
    await db.query("SELECT pg_advisory_xact_lock(20261015,170000)");
    const prior = await db.query("SELECT slot FROM nolt_private.developer_bootstrap LIMIT 1");
    const other = await db.query('SELECT id FROM public."User" WHERE role=\'DEVELOPER\'');
    if (prior.rowCount || other.rowCount)
      throw new Error("Developer already exists or bootstrap has been used. Manual recovery review is required.");
    const { rows } = await db.query(eligibilityQuery, [approvedSubject, approvedEmail]);
    const subject = assertEligibleDeveloper(rows[0], approvedEmail, approvedSubject);
    if (!apply) {
      console.log("Preflight PASSED: approved verified identity, TOTP factor, unassigned active user, no existing Developer.");
      console.log("NO CHANGES MADE. To provision, rerun with --apply after separate owner approval.");
      await db.query("ROLLBACK");
    } else {
      if (!stdin.isTTY || !stdout.isTTY)
        throw new Error("Interactive terminal confirmation is required.");
      const rl = createInterface({ input: stdin, output: stdout });
      let response;
      try {
        response = await rl.question("Type the approved Developer email to confirm account promotion: ");
      } finally { rl.close(); }
      if (response.trim() !== approvedEmail)
        throw new Error("Confirmation did not match; no changes made.");
      await db.query(`INSERT INTO nolt_private.developer_bootstrap ("userId","providerSubject","approvedEmail")
        VALUES ($1::uuid,$1::uuid,$2)`, [subject, approvedEmail]);
      const updated = await db.query(`UPDATE public."User"
        SET role='DEVELOPER', permissions=ARRAY[]::text[], "authVersion"="authVersion"+1
        WHERE id=$1::uuid AND role='EMPLOYEE' AND active=true RETURNING id`, [subject]);
      if (updated.rowCount !== 1) throw new Error("Account changed while provisioning.");
      await db.query(`UPDATE public."Session" SET "revokedAt"=now()
        WHERE "userId"=$1::uuid AND "revokedAt" IS NULL`, [subject]);
      await db.query(`INSERT INTO public."AuditEvent"(id,"actorId",action,"targetId",metadata)
        VALUES(gen_random_uuid(),$1::uuid,'DEVELOPER_BOOTSTRAPPED',$1::uuid,
          jsonb_build_object('method','offline_approved_owner','mfa_required',true))`, [subject]);
      await db.query(`INSERT INTO public."OutboxEvent"(id,type,"targetId")
        VALUES(gen_random_uuid(),'DEVELOPER_BOOTSTRAPPED',$1::uuid)`, [subject]);
      await db.query("COMMIT");
      console.log("Developer bootstrap applied. Sign in again and complete Supabase TOTP MFA.");
    }
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
} finally { await db.end(); }
