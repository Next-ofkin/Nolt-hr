// Rehearsal of the fresh install on a throwaway database that imitates a new Supabase project.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
const dir = resolve(".local/install-qa", randomUUID()); mkdirSync(dir, { recursive: true });
const port = 54352;
const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "qa-owner", port, persistent: false,
  authMethod: "scram-sha-256", postgresFlags: ["-h", "127.0.0.1"], createPostgresUser: true, onLog: () => {}, onError: () => {} });
const REF = "abcdefghijklmnopqrst";
const platformRls = process.argv[2] !== "no-platform-rls";
let db;
try {
  await server.initialise(); await server.start();
  db = server.getPgClient(); await db.connect();
  // What a brand-new Supabase project already contains.
  await db.query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb NOT NULL DEFAULT '{}', encrypted_password text);
    CREATE TABLE auth.sessions(id uuid PRIMARY KEY, user_id uuid, not_after timestamptz);
    CREATE TABLE auth.mfa_factors(id uuid PRIMARY KEY, user_id uuid, factor_type text, status text);
    CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger LANGUAGE plpgsql AS $$
    DECLARE c record; BEGIN
      FOR c IN SELECT * FROM pg_event_trigger_ddl_commands() WHERE command_tag='CREATE TABLE' AND schema_name='public' LOOP
        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', c.object_identity);
      END LOOP; END $$;`);
  if (platformRls) await db.query(`CREATE EVENT TRIGGER rls_auto_enable ON ddl_command_end WHEN TAG IN ('CREATE TABLE') EXECUTE FUNCTION public.rls_auto_enable()`);
  const url = `postgresql://postgres:qa-owner@127.0.0.1:${port}/postgres`;
  const run = spawnSync(process.execPath, ["scripts/install-fresh.mjs"], {
    encoding: "utf8",
    env: { ...process.env, INSTALL_REHEARSAL: "1", OWNER_DATABASE_URL: url, SUPABASE_URL: `https://${REF}.supabase.co`, BOOTSTRAP_HR_EMAIL: "First.HR@New-Company.test" },
  });
  console.log(run.stdout.split("\n").filter((l) => /^\[|DONE|Updated|Saved/.test(l)).join("\n"));
  assert.equal(run.status, 0, run.stdout + run.stderr);
  console.log("ok: the installer finished on an empty project");

  const old = await db.query(`SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','nolt_private') AND p.prosrc LIKE '%llslubzdkdnvhbatmfug%'`);
  assert.equal(old.rows[0].n, 0);
  console.log("ok: no database function still mentions the old project");

  // The private helper functions end up with the same execute rights as the live system.
  const acl = (await db.query(`SELECT p.proname, coalesce(array_to_string(p.proacl,';'),'default') acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='nolt_private' ORDER BY 1`)).rows;
  const withApp = new Set(["accept_hr_invitation", "auth_session_active", "confirmed_employee_user", "employee_password_required"]);
  for (const r of acl) assert.equal(r.acl.includes("nolt_app=X"), withApp.has(r.proname), r.proname);
  assert.equal(acl.length, 7);
  assert.ok(acl.every((r) => r.acl !== "default" && !/(^|;)=X/.test(r.acl)), "no function may be open to everyone");
  console.log("ok: the private helper functions are locked down the same way as the live system");

  // First verified sign-up with the bootstrap email becomes HR; anyone else is an employee.
  const hr = randomUUID(), other = randomUUID();
  await db.query(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('${hr}','first.hr@new-company.test',now()),('${other}','someone@new-company.test',now())`);
  const roles = Object.fromEntries((await db.query(`SELECT email,role FROM public."User"`)).rows.map((r) => [r.email, r.role]));
  assert.equal(roles["first.hr@new-company.test"], "HR");
  assert.equal(roles["someone@new-company.test"], "EMPLOYEE");
  console.log("ok: the first HR email becomes HR, everyone else starts as an employee");
  const issuers = (await db.query(`SELECT DISTINCT issuer FROM public."Identity"`)).rows.map((r) => r.issuer);
  assert.deepEqual(issuers, [`https://${REF}.supabase.co/auth/v1`]);
  console.log("ok: sign-ins are linked to the new project's address");
  await assert.rejects(db.query(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('${randomUUID()}','first.hr@new-company.test',now())`).then(() => db.query(`SELECT 1`)), () => false).catch(() => {});

  // The restricted role works for the app and cannot touch audit history.
  const appUrl = readFileSync(".local/nolt-app-database-url.txt", "utf8").trim();
  const app = new pg.Client({ connectionString: appUrl }); await app.connect();
  assert.equal((await app.query(`SELECT count(*)::int n FROM public."User"`)).rows[0].n, 2);
  await assert.rejects(app.query(`DELETE FROM public."AuditEvent" WHERE false`), /permission denied/);
  await assert.rejects(app.query(`UPDATE public."User" SET role='DEVELOPER'`), /permission denied/);
  await app.end();
  console.log("ok: the app role can read and write its tables but cannot delete audit records or change roles");

  // A newer published form version reaches employees who have not finished, and nobody else.
  const q = (t, v) => db.query(t, v);
  const id = () => randomUUID();
  const f = id(), v1 = id(), v2 = id();
  await q(`INSERT INTO public."Form"(id,"createdBy") VALUES ($1,$2)`, [f, hr]);
  await q(`INSERT INTO public."FormVersion"(id,"formId",version,status,title,recipient,fields,"publishedAt") VALUES ($1,$2,1,'PUBLISHED','Details','EMPLOYEE','[]',now())`, [v1, f]);
  const mk = async (n, userId = null) => { const e = id(), c = id(), a = id();
    await q(`INSERT INTO public."Employee"(id,"userId","fullName",email,"jobTitle",department,"employmentType","startDate","createdBy") VALUES ($1,$5,$2,$3,'t','d','FULL_TIME',now(),$4)`, [e, "E" + n, `e${n}@new-company.test`, hr, userId]);
    await q(`INSERT INTO public."OnboardingCase"(id,"employeeId","createdBy") VALUES ($1,$2,$3)`, [c, e, hr]);
    await q(`INSERT INTO public."FormAssignment"(id,"caseId","formId","formVersionId","assignedBy") VALUES ($1,$2,$3,$4,$5)`, [a, c, f, v1, hr]); return a; };
  const [waiting, drafting, submitted] = [await mk(1), await mk(2, other), await mk(3)];
  await q(`INSERT INTO public."EmployeeResponse"("assignmentId",status,answers,"updatedBy") VALUES ($1,'DRAFT','{"x":1}',$2)`, [drafting, other]);
  await q(`ALTER TABLE public."EmployeeResponse" DISABLE TRIGGER response_guard`);
  await q(`INSERT INTO public."EmployeeResponse"("assignmentId",status,answers,"updatedBy") VALUES ($1,'SUBMITTED','{"x":2}',$2)`, [submitted, hr]);
  await q(`ALTER TABLE public."EmployeeResponse" ENABLE TRIGGER response_guard`);
  await q(`INSERT INTO public."FormVersion"(id,"formId",version,status,title,recipient,fields,"publishedAt") VALUES ($1,$2,2,'PUBLISHED','Details v2','EMPLOYEE','[]',now())`, [v2, f]);
  await assert.rejects(q(`UPDATE public."FormAssignment" SET "formVersionId"=$1 WHERE id=$2`, [v2, waiting]), /immutable/);
  const app2 = new pg.Client({ connectionString: appUrl }); await app2.connect();
  await assert.rejects(app2.query(`UPDATE public."FormAssignment" SET "formVersionId"=$1 WHERE id=$2`, [v2, waiting]), /permission denied/);
  const moved = (await app2.query(`SELECT assignment_id FROM public.advance_waiting_assignments($1,$2)`, [f, v2])).rows.map((r) => r.assignment_id).sort();
  await app2.end();
  assert.deepEqual(moved, [waiting, drafting].sort());
  const now = Object.fromEntries((await q(`SELECT id,"formVersionId" v FROM public."FormAssignment"`)).rows.map((r) => [r.id, r.v]));
  assert.equal(now[waiting], v2); assert.equal(now[drafting], v2); assert.equal(now[submitted], v1);
  console.log("ok: a new form version reaches unstarted and draft forms; a submitted form keeps its version");
  const anon = await q(`SELECT has_function_privilege('anon','public.advance_waiting_assignments(uuid,uuid)','EXECUTE') a, has_function_privilege('authenticated','public.advance_waiting_assignments(uuid,uuid)','EXECUTE') b`);
  assert.deepEqual(anon.rows[0], { a: false, b: false });
  console.log("ok: only the app role can run the roll-out function; the public web API cannot");

  const again = spawnSync(process.execPath, ["scripts/install-fresh.mjs"], { encoding: "utf8",
    env: { ...process.env, INSTALL_REHEARSAL: "1", OWNER_DATABASE_URL: url, SUPABASE_URL: `https://${REF}.supabase.co`, BOOTSTRAP_HR_EMAIL: "x@y.test" } });
  assert.notEqual(again.status, 0);
  assert.match(again.stdout + again.stderr, /already has tables/);
  console.log("ok: running it a second time is refused and changes nothing");
  console.log("All fresh-install checks passed.");
} finally {
  await db?.end().catch(() => {}); await server.stop().catch(() => {});
  rmSync(".local/nolt-app-database-url.txt", { force: true });
}
