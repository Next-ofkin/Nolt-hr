// Domain/database verification only. This never starts an Auth provider or creates a login shortcut.
import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import EmbeddedPostgres from "embedded-postgres";
import { Database } from "../apps/api/dist/database.js";
import {
  EmployeesService,
  EmployeesGuard,
} from "../apps/api/dist/employees.js";
import { InvitationsService } from "../apps/api/dist/invitations.js";
import { SupabaseAuth } from "../apps/api/dist/supabase-auth.js";
import { Sessions } from "../apps/api/dist/sessions.js";
import { ResponsesService } from "../apps/api/dist/responses.js";
const directory = resolve(".local/onboarding-db-qa", randomUUID());
mkdirSync(directory, { recursive: true });
const server = new EmbeddedPostgres({
  databaseDir: directory,
  user: "postgres",
  password: "isolated-qa-owner",
  port: 54331,
  persistent: false,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
let owner, runtime;
try {
  await server.initialise();
  await server.start();
  owner = server.getPgClient();
  await owner.connect();
  await owner.query(
    "CREATE ROLE nolt_app LOGIN PASSWORD 'isolated-qa-app' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;",
  );
  for (const name of readdirSync("database/migrations")
    .filter((n) => /^\d/.test(n))
    .sort())
    await owner.query(
      readFileSync(`database/migrations/${name}/migration.sql`, "utf8"),
    );
  // Minimal local tables let the actual provisioning/linking triggers be tested without contacting Auth.
  await owner.query(`CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,encrypted_password text DEFAULT 'qa-password-hash',raw_user_meta_data jsonb DEFAULT '{}');
    CREATE TABLE auth.sessions(id uuid,user_id uuid,not_after timestamptz);
    REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO nolt_app;
    GRANT SELECT ON public."User",public."Identity" TO nolt_app;
    GRANT SELECT,INSERT ON public."AuditEvent",public."OutboxEvent" TO nolt_app;
    GRANT SELECT ON public."Form",public."FormVersion" TO nolt_app;`);
  await owner.query(
    readFileSync("database/supabase-auth-provisioning.sql", "utf8"),
  );
  await owner.query(
    readFileSync("database/supabase-employee-linking.sql", "utf8"),
  );
  process.env.DATABASE_URL =
    "postgresql://nolt_app:isolated-qa-app@127.0.0.1:54331/postgres";
  runtime = new Database();
  const service = new EmployeesService(runtime);
  const hr = randomUUID(),
    employee = randomUUID(),
    outsider = randomUUID();
  await owner.query(
    "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ($1,$2,now()),($3,$4,now())",
    [employee, "employee@example.invalid", outsider, "other@example.invalid"],
  );
  const profile = {
    fullName: "Test Employee",
    email: "EMPLOYEE@example.invalid",
    employeeNumber: "nolt-qa",
    jobTitle: "Analyst",
    department: "Finance",
    employmentType: "Permanent",
    startDate: "2026-10-13",
  };
  let detail = await service.create(hr, profile);
  assert.equal(detail.employee.userId, employee);
  assert.equal(detail.employee.email, "employee@example.invalid");
  assert.equal(detail.employee.employeeNumber, "NOLT-QA");
  assert.equal("createdBy" in detail.employee, false);
  await assert.rejects(
    service.create(hr, profile),
    (e) => e.getStatus() === 409,
  );
  assert.equal(
    (
      await service.list({
        department: "Finance",
        startFrom: "2026-10-01",
        caseStatus: "NONE",
      })
    ).items.length,
    1,
  );
  const updates = await Promise.allSettled(
    [1, 2].map(() =>
      service.update(hr, detail.employee.id, {
        expectedRevision: 1,
        profile: (({ email, ...rest }) => rest)(profile),
      }),
    ),
  );
  assert.equal(updates.filter((r) => r.status === "fulfilled").length, 1);
  const opens = await Promise.allSettled(
    [1, 2].map(() =>
      service.openCase(hr, detail.employee.id, { expectedRevision: 2 }),
    ),
  );
  assert.equal(opens.filter((r) => r.status === "fulfilled").length, 1);
  detail = await service.detail(detail.employee.id);
  const caseId = detail.onboardingCase.id;
  const form = randomUUID(),
    v1 = randomUUID(),
    v2 = randomUUID(),
    thirdForm = randomUUID(),
    thirdVersion = randomUUID();
  await owner.query(
    'INSERT INTO "Form"(id,"createdBy") VALUES($1,$2),($3,$2)',
    [form, hr, thirdForm],
  );
  await owner.query(
    `INSERT INTO "FormVersion"(id,"formId",version,status,title,recipient,"publishedAt") VALUES($1,$2,1,'PUBLISHED','Details v1','EMPLOYEE',now()),($3,$2,2,'DRAFT','Details v2','EMPLOYEE',NULL),($4,$5,1,'PUBLISHED','Guarantor','GUARANTOR',now())`,
    [v1, form, v2, thirdVersion, thirdForm],
  );
  await assert.rejects(
    service.assign(hr, caseId, {
      expectedRevision: 1,
      formVersionId: v2,
      required: true,
    }),
    (e) => e.getStatus() === 400,
  );
  const assignments = await Promise.allSettled(
    [1, 2].map(() =>
      service.assign(hr, caseId, {
        expectedRevision: 1,
        formVersionId: v1,
        required: true,
        dueDate: "2026-11-01",
      }),
    ),
  );
  assert.equal(assignments.filter((r) => r.status === "fulfilled").length, 1);
  const c = await service.assign(hr, caseId, {
    expectedRevision: 2,
    formVersionId: thirdVersion,
    required: false,
  });
  assert.equal(c.assignments[0].version, 1);
  assert.equal(c.assignments[0].dueDate, "2026-11-01");
  assert.equal(
    (await service.own(employee)).onboardingCase.assignments.length,
    2,
  );
  assert.equal((await service.own(outsider)).employee, null);
  assert.equal((await service.ownForm(employee, c.assignments[0].id)).id, v1);
  const responses = new ResponsesService(runtime),
    assigned = c.assignments[0].id;
  assert.equal((await responses.get(employee, assigned)).revision, 0);
  await assert.rejects(
    responses.get(outsider, assigned),
    (e) => e.getStatus() === 404,
  );
  await assert.rejects(
    responses.save(employee, c.assignments[1].id, {
      expectedRevision: 0,
      answers: {},
    }),
    (e) => e.getStatus() === 403,
  );
  const saves = await Promise.allSettled(
    [1, 2].map(() =>
      responses.save(employee, assigned, { expectedRevision: 0, answers: {} }),
    ),
  );
  assert.equal(saves.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await responses.get(employee, assigned)).revision, 1);
  const key = randomUUID();
  const submits = await Promise.allSettled(
    [1, 2].map(() =>
      responses.submit(employee, assigned, {
        expectedRevision: 1,
        requestKey: key,
      }),
    ),
  );
  assert.equal(submits.filter((r) => r.status === "fulfilled").length, 2);
  const submitted = await responses.get(employee, assigned);
  assert.equal(submitted.status, "SUBMITTED");
  assert.equal(submitted.submissions.length, 1);
  assert.equal(submitted.submissions[0].formVersionId, v1);
  await assert.rejects(
    responses.save(employee, assigned, { expectedRevision: 2, answers: {} }),
    (e) => e.getStatus() === 409,
  );
  await assert.rejects(
    responses.submit(employee, assigned, {
      expectedRevision: 2,
      requestKey: key,
    }),
    (e) => e.getStatus() === 409,
  );
  await assert.rejects(
    owner.query("UPDATE \"FormSubmission\" SET answers='{}' WHERE id=$1", [
      submitted.submissions[0].id,
    ]),
    /immutable/,
  );
  await assert.rejects(
    runtime.$executeRaw`DELETE FROM public."FormSubmission" WHERE id=${submitted.submissions[0].id}::uuid`,
    /permission denied/,
  );
  console.log(
    "PASS: response ownership, competing draft saves, concurrent submit replay, assigned version and immutable evidence.",
  );
  await assert.rejects(
    service.ownForm(outsider, c.assignments[0].id),
    (e) => e.getStatus() === 404,
  );
  await assert.rejects(
    service.ownForm(employee, c.assignments[1].id),
    (e) => e.getStatus() === 403,
  );
  await assert.rejects(
    owner.query('UPDATE "FormAssignment" SET required=false WHERE id=$1', [
      c.assignments[0].id,
    ]),
    /immutable/,
  );
  assert.equal(
    (await service.published({})).items.some((v) => v.id === v1),
    true,
  );
  for (const role of ["EMPLOYEE", "SYSTEM_ADMIN", "HR_REVIEWER"]) {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          actor: {
            role,
            permissions: role === "EMPLOYEE" ? ["profile.own"] : [],
          },
        }),
      }),
    };
    assert.throws(
      () => new EmployeesGuard().canActivate(context),
      (e) => e.getStatus() === 403,
    );
  }
  const pending = await service.create(hr, {
    ...profile,
    email: "pending@example.invalid",
    employeeNumber: null,
  });
  const pendingUser = randomUUID();
  await owner.query("INSERT INTO auth.users(id,email) VALUES($1,$2)", [
    pendingUser,
    "pending@example.invalid",
  ]);
  assert.equal(
    (await service.detail(pending.employee.id)).employee.userId,
    null,
  );
  await owner.query(
    "UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1",
    [pendingUser],
  );
  assert.equal(
    (await service.detail(pending.employee.id)).employee.userId,
    pendingUser,
  );
  const evidence = await owner.query(
    `SELECT action FROM "AuditEvent" WHERE action IN ('EMPLOYEE_CREATED','EMPLOYEE_UPDATED','ONBOARDING_CASE_OPENED','FORM_ASSIGNED','EMPLOYEE_ACCOUNT_LINKED')`,
  );
  assert.equal(evidence.rows.length, 7);
  const outbox = await owner.query(
    'SELECT count(*)::int AS count FROM "OutboxEvent"',
  );
  assert.equal(outbox.rows[0].count, 9); // Seven onboarding events plus one draft save and one submission.
  const grants = await owner.query(
    `SELECT has_table_privilege('anon','public."Employee"','SELECT') AS exposed, has_table_privilege('nolt_app','public."FormAssignment"','UPDATE') AS mutable`,
  );
  assert.deepEqual(grants.rows[0], { exposed: false, mutable: false });
  console.log(
    "PASS: employee linking, filtering, revision conflicts, single active case, published snapshots, ownership denial, third-party denial, immutable assignments, audit/outbox and restricted grants (isolated PostgreSQL; no live Auth).",
  );
  const auth = new SupabaseAuth(runtime),
    invites = new InvitationsService(
      runtime,
      auth,
      new Sessions(runtime, auth),
    );
  const request = { expectedRevision: 2, requestKey: randomUUID() };
  const first = await invites.enqueue(hr, detail.employee.id, request);
  assert.equal(
    (await invites.enqueue(hr, detail.employee.id, request)).id,
    first.id,
  );
  await assert.rejects(
    invites.enqueue(hr, detail.employee.id, {
      ...request,
      expectedRevision: 3,
    }),
    (e) => e.getStatus() === 409,
  );
  const replacements = await Promise.allSettled(
    [1, 2].map(() =>
      invites.enqueue(hr, detail.employee.id, {
        expectedRevision: 2,
        requestKey: randomUUID(),
        replaceInvitationId: first.id,
      }),
    ),
  );
  assert.equal(replacements.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await invites.list(detail.employee.id)).items.find(
      (i) => i.id === first.id,
    ).state,
    "REVOKED",
  );
  await assert.rejects(
    invites.exchange(
      {
        invitationId: first.id,
        proof: { tokenHash: "not-a-real-token", type: "invite" },
      },
      {},
      {},
    ),
    (e) => e.getStatus() === 403,
  );
  const active = (await invites.list(detail.employee.id)).items[0];
  process.env.INVITATION_TEST_RECIPIENTS = "";
  process.env.LOCAL_DEVELOPMENT = "true";
  const claims = await Promise.all([
    invites.deliverNext(),
    invites.deliverNext(),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(
    (await invites.list(detail.employee.id)).items[0].state,
    "FAILED",
  );
  assert.equal((await invites.list(detail.employee.id)).items[0].attempts, 1);
  await invites.revoke(hr, active.id);
  await invites.revoke(hr, active.id);
  const expiredInvite = await invites.enqueue(hr, detail.employee.id, {
    expectedRevision: 2,
    requestKey: randomUUID(),
  });
  await owner.query(
    `UPDATE "EmployeeInvitation" SET "createdAt"=now()-interval '2 hours',"expiresAt"=now()-interval '1 hour' WHERE id=$1`,
    [expiredInvite.id],
  );
  await invites.deliverNext();
  assert.equal(
    (await invites.list(detail.employee.id)).items.find(
      (i) => i.id === expiredInvite.id,
    ).state,
    "EXPIRED",
  );
  const lease = await invites.enqueue(hr, detail.employee.id, {
    expectedRevision: 2,
    requestKey: randomUUID(),
  });
  await owner.query(
    `UPDATE "EmployeeInvitation" SET state='SENDING' WHERE id=$1`,
    [lease.id],
  );
  await owner.query(
    `UPDATE "InvitationDelivery" SET state='SENDING',attempts=1,"leaseUntil"=now()-interval '1 minute' WHERE "invitationId"=$1`,
    [lease.id],
  );
  await invites.deliverNext();
  assert.equal(
    (await invites.list(detail.employee.id)).items[0].state,
    "UNCERTAIN",
  );
  console.log(
    "PASS: invitation idempotency, conflicting resend, revoked-link denial, exclusive worker claims, approved-recipient denial, expiry, revoke replay and uncertain-delivery recovery (no email sent).",
  );
  const retryInvite = await invites.enqueue(hr, detail.employee.id, {
    expectedRevision: 2,
    requestKey: randomUUID(),
    replaceInvitationId: lease.id,
  });
  process.env.INVITATION_TEST_RECIPIENTS = "employee@example.invalid";
  process.env.SUPABASE_URL = "https://mail-boundary.example.invalid";
  process.env.SUPABASE_PUBLISHABLE_KEY = "qa-mail-key";
  process.env.SUPABASE_SECRET_KEY = "qa-server-mail-key";
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async (input) => {
      assert.equal(new URL(String(input)).pathname, "/auth/v1/otp");
      calls++;
      return new Response(
        JSON.stringify({
          code: "over_email_send_rate_limit",
          msg: "Email send limit",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    };
    for (let attempt = 1; attempt <= 5; attempt++) {
      await owner.query(
        'UPDATE "InvitationDelivery" SET "availableAt"=now() WHERE "invitationId"=$1',
        [retryInvite.id],
      );
      await invites.deliverNext();
      const i = (await invites.list(detail.employee.id)).items.find(
        (i) => i.id === retryInvite.id,
      );
      assert.equal(i.attempts, attempt);
      assert.equal(i.state, attempt < 5 ? "QUEUED" : "FAILED");
    }
    assert.equal(calls, 5);
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log(
    "PASS: actual SDK email-error parsing plus committed backoff/five-attempt exhaustion, with a test-only failed email transport (no Auth shortcut or email delivery claim).",
  );
  await owner.query("UPDATE auth.users SET encrypted_password='' WHERE id=$1", [
    employee,
  ]);
  const resumed = await invites.enqueue(hr, detail.employee.id, {
    expectedRevision: 2,
    requestKey: randomUUID(),
    replaceInvitationId: retryInvite.id,
  });
  assert.equal(
    (
      await runtime.employeeInvitation.findUniqueOrThrow({
        where: { id: resumed.id },
      })
    ).requiresPassword,
    true,
  );
  console.log(
    "PASS: a verified, already-linked invitee who lacks a password must still finish password setup after resend.",
  );
} finally {
  await runtime?.$disconnect();
  await owner?.end();
  if (process.platform === "win32" && server.process) {
    // embedded-postgres uses forced taskkill on Windows, which hung in this environment.
    // Use PostgreSQL's own bounded, graceful shutdown for this exact QA cluster instead.
    const { pg_ctl } = await import("@embedded-postgres/windows-x64");
    const child = server.process;
    const exited = new Promise((resolve) => child.once("exit", resolve));
    await promisify(execFile)(
      pg_ctl,
      ["stop", "-D", directory, "-m", "fast", "-w", "-t", "15"],
      { windowsHide: true, timeout: 20000 },
    );
    await exited;
    server.process = undefined; // Prevent the library exit hook from attempting a second stop.
    // Leave the uniquely named ignored QA data directory for diagnosis; no recursive deletion.
  } else await server.stop();
}
