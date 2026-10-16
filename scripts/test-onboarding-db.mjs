import { digest } from "../apps/api/dist/security.js";
import { ExternalSessions } from "../apps/api/dist/external-sessions.js";
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
import { HrInvitationDeliveryLedger } from "../apps/api/dist/hr-invitation-ledger.js";
import { HrInvitationWorker } from "../apps/api/dist/hr-invitation-worker.js";
import { DeveloperOverviewService } from "../apps/api/dist/developer.js";
import { Sessions } from "../apps/api/dist/sessions.js";
import { ResponsesService } from "../apps/api/dist/responses.js";
import { ExternalContactsService } from "../apps/api/dist/external-contacts.js";
import { ExternalRequestsService } from "../apps/api/dist/external-requests.js";
import { createField } from "@nolt/form-schemas";
import { FilesService, FilesStorage } from "../apps/api/dist/files.js";
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
    GRANT SELECT ON public."Form" TO nolt_app;
    GRANT SELECT,UPDATE ON public."FormVersion" TO nolt_app;`);
  await owner.query(
    readFileSync("database/supabase-auth-provisioning.sql", "utf8"),
  );
  await owner.query(
    readFileSync("database/supabase-employee-linking.sql", "utf8"),
  );
  process.env.DATABASE_URL =
    "postgresql://nolt_app:isolated-qa-app@127.0.0.1:54331/postgres";
  runtime = new Database();
  // Exercise the actual encrypted flow creation, including its database kind constraint.
  const flowAuth = new SupabaseAuth(runtime);
  const priorEncryptionKey = process.env.AUTH_ENCRYPTION_KEY;
  const priorFlowLocal = process.env.LOCAL_DEVELOPMENT;
  process.env.LOCAL_DEVELOPMENT = "true";
  process.env.AUTH_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  const flowCookies = [];
  await flowAuth.start(
    "EXTERNAL",
    { externalRequestId: randomUUID() },
    { headers: {} },
    { cookie: (...values) => flowCookies.push(values) },
  );
  assert.equal(flowCookies.length, 1);
  assert.equal(
    await runtime.authFlow.count({ where: { kind: "EXTERNAL" } }),
    1,
  );
  const hrFlowCookie = [];
  await flowAuth.start(
    "HR_INVITATION",
    { invitationId: randomUUID(), tokens: { access_token: "synthetic", refresh_token: "synthetic" } },
    { headers: {} },
    { cookie: (...args) => hrFlowCookie.push(args) },
  );
  assert.equal(hrFlowCookie.length, 1);
  assert.equal(await runtime.authFlow.count({ where: { kind: "HR_INVITATION" } }), 1);
  assert.equal(await runtime.session.count(), 0);
  console.log("PASS: isolated encrypted HR_INVITATION flow passes DB kind constraint without creating workspace session or calling Supabase.");
  if (priorEncryptionKey === undefined) delete process.env.AUTH_ENCRYPTION_KEY;
  else process.env.AUTH_ENCRYPTION_KEY = priorEncryptionKey;
  if (priorFlowLocal === undefined) delete process.env.LOCAL_DEVELOPMENT;
  else process.env.LOCAL_DEVELOPMENT = priorFlowLocal;
  console.log(
    "PASS: real encrypted EXTERNAL AuthFlow persistence satisfies the database constraint and issues a cookie only after commit (domain boundary; no authenticated session).",
  );
  const service = new EmployeesService(runtime);
  const hr = randomUUID(),
    employee = randomUUID(),
    outsider = randomUUID();
  await owner.query(
    "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ($1,$2,now()),($3,$4,now()),($5,$6,now())",
    [
      employee,
      "employee@example.invalid",
      outsider,
      "other@example.invalid",
      hr,
      "hr@example.invalid",
    ],
  );
  await owner.query(
    "UPDATE public.\"User\" SET role='HR', active=true WHERE id=$1",
    [hr],
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
  const externalQuestion = {
    ...createField("text", randomUUID()),
    label: "Guarantor statement",
    required: true,
  };
  await owner.query(
    `INSERT INTO "FormVersion"(id,"formId",version,status,title,recipient,"publishedAt",fields) VALUES($1,$2,1,'PUBLISHED','Details v1','EMPLOYEE',now(),'[]'),($3,$2,2,'DRAFT','Details v2','EMPLOYEE',NULL,'[]'),($4,$5,1,'PUBLISHED','Guarantor','GUARANTOR',now(),$6::jsonb)`,
    [v1, form, v2, thirdVersion, thirdForm, JSON.stringify([externalQuestion])],
  );
  await assert.rejects(
    service.assign(hr, caseId, {
      expectedRevision: 1,
      formVersionId: v2,
      required: true,
    }),
    (e) => {
      if (typeof e?.getStatus !== "function")
        throw new Error(
          "Expected a 400 rejection for a draft form assignment, but received " +
            (e?.constructor?.name ?? typeof e) +
            ": " +
            (e?.message ?? "no error message"),
          { cause: e },
        );
      assert.equal(e.getStatus(), 400);
      return true;
    },
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
  const contacts = new ExternalContactsService(runtime);
  const contactAssignment = c.assignments[1].id;
  const contactInput = {
    fullName: "Independent Recipient",
    email: "Recipient@example.invalid",
    expectedRevision: 0,
  };
  assert.equal((await contacts.get(employee, contactAssignment)).revision, 0);
  await assert.rejects(
    contacts.get(outsider, contactAssignment),
    (e) => e.getStatus() === 404,
  );
  await assert.rejects(
    contacts.save(outsider, contactAssignment, contactInput),
    (e) => e.getStatus() === 404,
  );
  await assert.rejects(
    contacts.save(employee, c.assignments[0].id, contactInput),
    (e) => e.getStatus() === 403,
  );
  await assert.rejects(
    contacts.save(employee, contactAssignment, {
      ...contactInput,
      email: profile.email,
    }),
    (e) => e.getStatus() === 400,
  );
  await assert.rejects(
    contacts.save(employee, contactAssignment, {
      ...contactInput,
      respondentId: employee,
    }),
    (e) => e.getStatus() === 400,
  );
  const contactWrites = await Promise.allSettled(
    [1, 2].map(() => contacts.save(employee, contactAssignment, contactInput)),
  );
  assert.equal(contactWrites.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    contactWrites.find((r) => r.status === "rejected").reason.getStatus(),
    409,
  );
  const contactSaved = await contacts.get(employee, contactAssignment);
  assert.equal(contactSaved.revision, 1);
  assert.equal(contactSaved.email, "recipient@example.invalid");
  assert.equal(contactSaved.status, "NOT_SENT");
  const contactUpdated = await contacts.save(employee, contactAssignment, {
    ...contactInput,
    fullName: "Revised Recipient",
    expectedRevision: 1,
  });
  assert.equal(contactUpdated.revision, 2);
  assert.equal(
    await runtime.auditEvent.count({
      where: { action: "EXTERNAL_CONTACT_SAVED", targetId: contactAssignment },
    }),
    2,
  );
  assert.equal(
    await runtime.outboxEvent.count({
      where: { type: "EXTERNAL_CONTACT_SAVED", targetId: contactAssignment },
    }),
    2,
  );
  await assert.rejects(
    owner.query(
      'UPDATE public."ExternalContactDraft" SET "assignmentId"=$1, revision=revision+1 WHERE "assignmentId"=$2',
      [c.assignments[0].id, contactAssignment],
    ),
  );
  await assert.rejects(
    owner.query(
      'UPDATE public."ExternalContactDraft" SET "updatedBy"=$1, revision=revision+1 WHERE "assignmentId"=$2',
      [outsider, contactAssignment],
    ),
  );
  await assert.rejects(
    owner.query(
      'UPDATE public."ExternalContactDraft" SET email=$1, revision=revision+1 WHERE "assignmentId"=$2',
      [profile.email.toLowerCase(), contactAssignment],
    ),
  );
  await assert.rejects(
    owner.query(
      'DELETE FROM public."ExternalContactDraft" WHERE "assignmentId"=$1',
      [contactAssignment],
    ),
  );
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.equal(
      (
        await owner.query(
          "SELECT has_table_privilege($1, 'public.\"ExternalContactDraft\"', 'SELECT') AS allowed",
          [role],
        )
      ).rows[0].allowed,
      false,
    );
  }
  console.log(
    "PASS: external contact ownership, recipient restrictions, competing edits, database guards and atomic audit/outbox; details remain NOT_SENT.",
  );
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

  // Review flow: HR inspects submission v1
  await assert.rejects(
    responses.getReview(hr, assigned),
    (e) => e.getStatus() === 404,
  );
  await responses.assignReviewer(hr, assigned, {
    reviewerEmail: "hr@example.invalid",
    sensitivity: "GENERAL",
  });
  await assert.rejects(
    responses.getReview(outsider, assigned),
    (e) => e.getStatus() === 404,
  );
  const reviewData = await responses.getReview(hr, assigned);
  assert.equal(reviewData.assignmentId, assigned);
  assert.equal(reviewData.employeeEmail, "employee@example.invalid");
  assert.equal(reviewData.status, "SUBMITTED");
  assert.equal(reviewData.submissions.length, 1);
  assert.equal(reviewData.submissions[0].version, 1);
  assert.equal(reviewData.submissions[0].review, null);

  // Review decision validation
  await assert.rejects(
    responses.decide(hr, submitted.submissions[0].id, {
      decision: "CHANGES_REQUIRED",
      reason: "",
      expectedSubmissionVersion: 1,
      expectedResponseRevision: 2,
    }),
    (e) => e.getStatus() === 400,
  );
  await assert.rejects(
    responses.decide(hr, submitted.submissions[0].id, {
      decision: "CHANGES_REQUIRED",
      reason: "Please update your details",
      expectedSubmissionVersion: 2,
      expectedResponseRevision: 2,
    }),
    (e) => e.getStatus() === 409,
  );
  await assert.rejects(
    responses.decide(hr, submitted.submissions[0].id, {
      decision: "CHANGES_REQUIRED",
      reason: "Please update your details",
      expectedSubmissionVersion: 1,
      expectedResponseRevision: 99,
    }),
    (e) => e.getStatus() === 409,
  );

  // HR requests changes with mandatory reason
  const competingReviews = await Promise.allSettled(
    [1, 2].map(() =>
      responses.decide(hr, submitted.submissions[0].id, {
        decision: "CHANGES_REQUIRED",
        reason: "Please provide complete details for all fields.",
        expectedSubmissionVersion: 1,
        expectedResponseRevision: 2,
      }),
    ),
  );
  assert.equal(
    competingReviews.filter((r) => r.status === "fulfilled").length,
    1,
  );
  const loser = competingReviews.find((r) => r.status === "rejected");
  assert.equal(loser.reason.getStatus(), 409);
  const changesReview = competingReviews.find(
    (r) => r.status === "fulfilled",
  ).value;
  assert.equal(changesReview.status, "CHANGES_REQUIRED");
  assert.equal(changesReview.latestReview?.decision, "CHANGES_REQUIRED");
  assert.equal(
    changesReview.latestReview?.reason,
    "Please provide complete details for all fields.",
  );

  // Review immutability: trigger rejects direct modification of recorded review
  await assert.rejects(
    owner.query(
      'UPDATE "SubmissionReview" SET decision=\'APPROVED\' WHERE "submissionId"=$1',
      [submitted.submissions[0].id],
    ),
    /immutable/,
  );
  await assert.rejects(
    runtime.$executeRaw`DELETE FROM public."SubmissionReview" WHERE "submissionId"=${submitted.submissions[0].id}::uuid`,
    /permission denied/,
  );
  // Second review on the same submission rejected
  await assert.rejects(
    responses.decide(hr, submitted.submissions[0].id, {
      decision: "APPROVED",
      expectedSubmissionVersion: 1,
      expectedResponseRevision: 3,
    }),
    (e) => e.getStatus() === 409,
  );

  // Employee can edit draft under CHANGES_REQUIRED (revision incremented to 3)
  const draft2 = await responses.save(employee, assigned, {
    expectedRevision: 3,
    answers: {},
  });
  assert.equal(draft2.revision, 4);
  assert.equal(draft2.status, "CHANGES_REQUIRED");

  // Employee resubmits -> version becomes 2
  const key2 = randomUUID();
  const resubmitted = await responses.submit(employee, assigned, {
    expectedRevision: 4,
    requestKey: key2,
  });
  assert.equal(resubmitted.status, "SUBMITTED");
  assert.equal(resubmitted.submissions.length, 2);
  assert.equal(resubmitted.submissions[0].version, 2);
  assert.equal(resubmitted.submissions[0].review, null);
  await assert.rejects(
    runtime.$executeRaw`UPDATE public."EmployeeResponse" SET status='CHANGES_REQUIRED',revision=revision+1,"updatedBy"=${hr}::uuid WHERE "assignmentId"=${assigned}::uuid`,
    /exact latest submission/,
  );
  // Prior submission v1 and its review decision are completely preserved
  assert.equal(resubmitted.submissions[1].version, 1);
  assert.equal(resubmitted.submissions[1].review?.decision, "CHANGES_REQUIRED");
  assert.equal(
    resubmitted.submissions[1].review?.reason,
    "Please provide complete details for all fields.",
  );

  // Trigger test: cannot create version 3 without requested changes on version 2
  await assert.rejects(
    owner.query(
      'INSERT INTO "FormSubmission"(id,"assignmentId","formVersionId",version,"sourceRevision","requestKey",answers,"submittedBy") VALUES ($1,$2,$3,3,5,$4,\'{}\',$5)',
      [randomUUID(), assigned, v1, randomUUID(), employee],
    ),
    /Resubmission requires preceding submission with changes-required decision/,
  );

  // HR reviews submission v2 and approves
  const approvedReview = await responses.decide(
    hr,
    resubmitted.submissions[0].id,
    {
      decision: "APPROVED",
      expectedSubmissionVersion: 2,
      expectedResponseRevision: 5,
    },
  );
  assert.equal(approvedReview.status, "APPROVED");
  assert.equal(approvedReview.latestReview?.decision, "APPROVED");

  // Approved response is permanently locked against further draft saves or submits
  await assert.rejects(
    responses.save(employee, assigned, { expectedRevision: 6, answers: {} }),
    (e) => e.getStatus() === 409,
  );
  await assert.rejects(
    responses.submit(employee, assigned, {
      expectedRevision: 6,
      requestKey: randomUUID(),
    }),
    (e) => e.getStatus() === 409,
  );
  console.log(
    "PASS: review lifecycle, mandatory change reasons, version-preserving resubmission, immutable audit reviews and post-approval locking.",
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
  const reviewEvidence = await owner.query(
    `SELECT action FROM "AuditEvent" WHERE action IN ('REVIEW_CHANGES_REQUIRED','REVIEW_APPROVED')`,
  );
  assert.equal(reviewEvidence.rows.length, 2);
  const outbox = await owner.query(
    `SELECT count(*)::int AS count FROM "OutboxEvent" WHERE type<>'EXTERNAL_CONTACT_SAVED'`,
  );
  assert.equal(outbox.rows[0].count, 14); // Seven onboarding events, two saves, two submissions, two reviews and explicit reviewer assignment.
  const grants = await owner.query(
    `SELECT has_table_privilege('anon','public."Employee"','SELECT') AS exposed, has_table_privilege('nolt_app','public."FormAssignment"','UPDATE') AS mutable`,
  );
  assert.deepEqual(grants.rows[0], { exposed: false, mutable: false });
  console.log(
    "PASS: employee linking, filtering, revision conflicts, single active case, published snapshots, ownership denial, third-party denial, immutable assignments, audit/outbox and restricted grants (isolated PostgreSQL; no live Auth).",
  );
  const otherHr = randomUUID(),
    technical = randomUUID();
  await owner.query(
    "INSERT INTO public.\"User\"(id,email,name,role) VALUES($1,'other-hr@example.invalid','Other HR','HR'),($2,'technical@example.invalid','Technical','SYSTEM_ADMIN')",
    [otherHr, technical],
  );
  await assert.rejects(
    responses.getReview(otherHr, assigned),
    (e) => e.getStatus() === 404,
  );
  await assert.rejects(
    responses.assignReviewer(otherHr, assigned, {
      reviewerEmail: "other-hr@example.invalid",
      sensitivity: "GENERAL",
    }),
    (e) => e.getStatus() === 404,
  );
  await assert.rejects(
    responses.assignReviewer(hr, assigned, {
      reviewerEmail: "technical@example.invalid",
      sensitivity: "GENERAL",
    }),
    (e) => e.getStatus() === 400,
  );
  const sensitiveForm = randomUUID(),
    sensitiveVersion = randomUUID(),
    sensitiveAssignment = randomUUID();
  await owner.query('INSERT INTO public."Form"(id,"createdBy") VALUES($1,$2)', [
    sensitiveForm,
    hr,
  ]);
  await owner.query(
    "INSERT INTO public.\"FormVersion\"(id,\"formId\",version,status,title,recipient,\"publishedAt\") VALUES($1,$2,1,'PUBLISHED','Sensitive QA','EMPLOYEE',now())",
    [sensitiveVersion, sensitiveForm],
  );
  await owner.query(
    'INSERT INTO public."FormAssignment"(id,"caseId","formId","formVersionId","assignedBy") VALUES($1,$2,$3,$4,$5)',
    [sensitiveAssignment, caseId, sensitiveForm, sensitiveVersion, hr],
  );
  await responses.assignReviewer(hr, sensitiveAssignment, {
    reviewerEmail: "hr@example.invalid",
    sensitivity: "HEALTH_FINANCIAL",
  });
  await assert.rejects(
    responses.getReview(hr, sensitiveAssignment),
    (e) => e.getStatus() === 403,
  );
  await owner.query(
    "UPDATE public.\"User\" SET permissions=ARRAY['health.read'] WHERE id=$1",
    [hr],
  );
  await assert.rejects(
    responses.getReview(hr, sensitiveAssignment),
    (e) => e.getStatus() === 403,
  );
  await owner.query(
    "UPDATE public.\"User\" SET permissions=ARRAY['health.read','finance.read'] WHERE id=$1",
    [hr],
  );
  assert.equal(
    (await responses.getReview(hr, sensitiveAssignment)).assignmentId,
    sensitiveAssignment,
  );
  await owner.query(
    'UPDATE public."User" SET permissions=ARRAY[]::text[] WHERE id=$1',
    [hr],
  );
  await assert.rejects(
    responses.getReview(hr, sensitiveAssignment),
    (e) => e.getStatus() === 403,
  );
  const direct =
    await runtime.$queryRaw`SELECT public.can_review_assignment(${technical}::uuid,${assigned}::uuid) AS allowed`;
  assert.equal(direct[0].allowed, false);
  console.log(
    "PASS: explicit record scope, case-owner-only grants, separate health/financial permissions, permission removal and technical-admin denial.",
  );

  // --- PRIVATE UPLOADS AND SIGNATURES ACCEPTANCE ---
  // Explicit test double at the storage/scanner boundary. Real Auth is never mocked.
  class DomainTestStorage extends FilesStorage {
    objects = new Map();
    async scan() {} // Scanner protocol/fail-closed behaviour has separate unit tests.
    async put(bucket, key, bytes) {
      const id = bucket + "/" + key;
      if (this.objects.has(id) && !this.objects.get(id).equals(bytes))
        throw new Error("Immutable object");
      this.objects.set(id, Buffer.from(bytes));
    }
    async get(bucket, key) {
      return this.objects.get(bucket + "/" + key);
    }
  }
  const files = new FilesService(runtime, new DomainTestStorage());

  const uploadFormId = randomUUID();
  const uploadVersionId = randomUUID();
  const fileFieldId = randomUUID();
  const sigFieldId = randomUUID();
  const textQuestionId = randomUUID();

  const uploadFields = [
    {
      id: textQuestionId,
      type: "text",
      label: "Full Name",
      helpText: "",
      required: true,
      options: [],
      signatureMethod: "EITHER",
      attachmentPurpose: "SUPPORTING_DOCUMENT",
    },
    {
      id: fileFieldId,
      type: "file",
      label: "Passport Copy",
      helpText: "",
      required: true,
      options: [],
      signatureMethod: "EITHER",
      attachmentPurpose: "SUPPORTING_DOCUMENT",
    },
    {
      id: sigFieldId,
      type: "signature",
      label: "Applicant Signature",
      helpText: "",
      required: true,
      options: [],
      signatureMethod: "DRAW",
      attachmentPurpose: "SUPPORTING_DOCUMENT",
    },
  ];

  await owner.query('INSERT INTO public."Form"(id,"createdBy") VALUES($1,$2)', [
    uploadFormId,
    hr,
  ]);
  await owner.query(
    `INSERT INTO public."FormVersion"(id,"formId",version,status,title,recipient,fields,"publishedAt")
     VALUES($1,$2,1,'PUBLISHED','Upload & Signature QA','EMPLOYEE',$3,now())`,
    [uploadVersionId, uploadFormId, JSON.stringify(uploadFields)],
  );

  const uploadAssignmentId = randomUUID();
  await owner.query(
    'INSERT INTO public."FormAssignment"(id,"caseId","formId","formVersionId","assignedBy") VALUES($1,$2,$3,$4,$5)',
    [uploadAssignmentId, caseId, uploadFormId, uploadVersionId, hr],
  );

  // Stranger cannot create upload intent
  await assert.rejects(
    files.createUploadIntent(outsider, uploadAssignmentId, {
      fieldId: fileFieldId,
      purpose: "SUPPORTING_DOCUMENT",
      fileName: "passport.pdf",
      mimeType: "application/pdf",
      byteSize: 1024,
      requestKey: randomUUID(),
    }),
    (e) => e.getStatus() === 403,
  );

  // Employee creates upload intent
  const fileIntentKey = randomUUID();
  const intent = await files.createUploadIntent(employee, uploadAssignmentId, {
    fieldId: fileFieldId,
    purpose: "SUPPORTING_DOCUMENT",
    fileName: "passport.pdf",
    mimeType: "application/pdf",
    byteSize: Buffer.byteLength("%PDF-1.7 real passport document content"),
    requestKey: fileIntentKey,
  });
  assert.equal(intent.requestKey, fileIntentKey);

  // Idempotent intent retry
  const intentRetry = await files.createUploadIntent(
    employee,
    uploadAssignmentId,
    {
      fieldId: fileFieldId,
      purpose: "SUPPORTING_DOCUMENT",
      fileName: "passport.pdf",
      mimeType: "application/pdf",
      byteSize: Buffer.byteLength("%PDF-1.7 real passport document content"),
      requestKey: fileIntentKey,
    },
  );
  assert.equal(intentRetry.fileId, intent.fileId);

  // Stranger cannot upload to intent
  await assert.rejects(
    files.uploadFile(outsider, uploadAssignmentId, intent.fileId, {
      requestKey: randomUUID(),
      payloadBase64: Buffer.from("%PDF-1.7 passport content").toString(
        "base64",
      ),
    }),
    (e) => e.getStatus() === 403,
  );

  // Malicious SVG upload is rejected by security scanning
  const svgIntentKey = randomUUID();
  const svgIntent = await files.createUploadIntent(
    employee,
    uploadAssignmentId,
    {
      fieldId: fileFieldId,
      purpose: "SUPPORTING_DOCUMENT",
      fileName: "malicious.svg",
      mimeType: "image/svg+xml",
      byteSize: 512,
      requestKey: svgIntentKey,
    },
  );
  await assert.rejects(
    files.uploadFile(employee, uploadAssignmentId, svgIntent.fileId, {
      requestKey: randomUUID(),
      payloadBase64: Buffer.from(
        "<svg><script>alert(1)</script></svg>",
      ).toString("base64"),
    }),
    (e) => e.getStatus() === 400,
  );

  // Rejected file cannot be downloaded
  await assert.rejects(
    files.downloadFile(employee, svgIntent.fileId),
    (e) => e.getStatus() === 403,
  );

  // Valid PDF upload succeeds and is confirmed clean
  const validPdfUpload = await files.uploadFile(
    employee,
    uploadAssignmentId,
    intent.fileId,
    {
      requestKey: randomUUID(),
      payloadBase64: Buffer.from(
        "%PDF-1.7 real passport document content",
      ).toString("base64"),
    },
  );
  assert.equal(validPdfUpload.status, "CONFIRMED");
  assert.equal(validPdfUpload.scanStatus, "CLEAN");

  // Initial draft save with answers (including file attachment)
  let uploadDraft = await responses.save(employee, uploadAssignmentId, {
    expectedRevision: 0,
    answers: {
      [textQuestionId]: "Official Candidate Name",
      [fileFieldId]: intent.fileId,
    },
  });
  assert.equal(uploadDraft.revision, 1);

  // Capture signature bound to current answers revision
  const { default: sharp } = await import("sharp");
  const fakePngSig = await sharp({
    create: { width: 100, height: 30, channels: 4, background: "black" },
  })
    .png()
    .toBuffer();
  await assert.rejects(
    files.captureSignature(employee, uploadAssignmentId, {
      fieldId: sigFieldId,
      signingMethod: "TYPED",
      consentVersion: "development-confirmation-v1",
      consentConfirmed: true,
      expectedRevision: 1,
      signatureImageBase64: fakePngSig.toString("base64"),
      requestKey: randomUUID(),
    }),
    (e) => e.getStatus() === 400,
  );
  await assert.rejects(
    files.captureSignature(employee, uploadAssignmentId, {
      fieldId: sigFieldId,
      signingMethod: "DRAWN",
      consentVersion: "unapproved-client-version",
      consentConfirmed: true,
      expectedRevision: 1,
      signatureImageBase64: fakePngSig.toString("base64"),
      requestKey: randomUUID(),
    }),
    (e) => e.getStatus() === 400,
  );
  const signatureRequestKey = randomUUID();
  const sigRes = await files.captureSignature(employee, uploadAssignmentId, {
    fieldId: sigFieldId,
    signingMethod: "DRAWN",
    consentVersion: "development-confirmation-v1",
    consentConfirmed: true,
    expectedRevision: 1,
    signatureImageBase64: fakePngSig.toString("base64"),
    requestKey: signatureRequestKey,
  });
  assert.ok(sigRes.signatureId);
  assert.ok(sigRes.contentDigest);

  const signatureReplay = await files.captureSignature(
    employee,
    uploadAssignmentId,
    {
      fieldId: sigFieldId,
      signingMethod: "DRAWN",
      consentVersion: "development-confirmation-v1",
      consentConfirmed: true,
      expectedRevision: 1,
      signatureImageBase64: fakePngSig.toString("base64"),
      requestKey: signatureRequestKey,
    },
  );
  assert.equal(signatureReplay.signatureId, sigRes.signatureId);
  // SignatureEvidence immutability trigger test
  await assert.rejects(
    owner.query(
      'UPDATE public."SignatureEvidence" SET "signingMethod"=\'TYPED\' WHERE id=$1',
      [sigRes.signatureId],
    ),
    /immutable/,
  );
  await assert.rejects(
    owner.query('DELETE FROM public."SignatureEvidence" WHERE id=$1', [
      sigRes.signatureId,
    ]),
    /immutable/,
  );

  // StoredFile immutability trigger test
  await assert.rejects(
    owner.query('DELETE FROM public."StoredFile" WHERE id=$1', [sigRes.fileId]),
    /cannot be deleted/,
  );

  // Attaching signature to answers
  uploadDraft = await responses.save(employee, uploadAssignmentId, {
    expectedRevision: 1,
    answers: {
      [textQuestionId]: "Official Candidate Name",
      [fileFieldId]: intent.fileId,
      [sigFieldId]: sigRes.signatureId,
    },
  });
  assert.equal(uploadDraft.revision, 2);

  // Modifying text answers after signing invalidates signature on submit
  uploadDraft = await responses.save(employee, uploadAssignmentId, {
    expectedRevision: 2,
    answers: {
      [textQuestionId]: "Tampered Candidate Name",
      [fileFieldId]: intent.fileId,
      [sigFieldId]: sigRes.signatureId,
    },
  });
  assert.equal(uploadDraft.revision, 3);

  await assert.rejects(
    responses.submit(employee, uploadAssignmentId, {
      expectedRevision: 3,
      requestKey: randomUUID(),
    }),
    (e) =>
      e.getStatus() === 400 &&
      e.getResponse().fields.some((f) => f.fieldId === sigFieldId),
  );

  // Re-signing with current answers allows successful submission
  const reSigRes = await files.captureSignature(employee, uploadAssignmentId, {
    fieldId: sigFieldId,
    signingMethod: "DRAWN",
    consentVersion: "development-confirmation-v1",
    consentConfirmed: true,
    expectedRevision: 3,
    signatureImageBase64: fakePngSig.toString("base64"),
    requestKey: randomUUID(),
  });

  uploadDraft = await responses.save(employee, uploadAssignmentId, {
    expectedRevision: 3,
    answers: {
      [textQuestionId]: "Tampered Candidate Name",
      [fileFieldId]: intent.fileId,
      [sigFieldId]: reSigRes.signatureId,
    },
  });
  assert.equal(uploadDraft.revision, 4);

  const uploadSubmit = await responses.submit(employee, uploadAssignmentId, {
    expectedRevision: 4,
    requestKey: randomUUID(),
  });
  assert.equal(uploadSubmit.status, "SUBMITTED");
  assert.equal(uploadSubmit.submissions[0].version, 1);

  // Download access test
  const downloaded = await files.downloadFile(employee, intent.fileId);
  assert.equal(downloaded.fileName, "passport.pdf");
  assert.equal(downloaded.mimeType, "application/pdf");

  // Stranger cannot download
  await assert.rejects(
    files.downloadFile(outsider, intent.fileId),
    (e) => e.getStatus() === 403,
  );

  console.log(
    "PASS: file/signature domain rules, rejected headers, MIME detection, content binding, invalidation, immutability and download scoping (explicit storage/scanner test doubles; no hosted scanning claim).",
  );

  // Suppress only the automatic background kick in isolated domain QA.
  // Explicit deliverNext() calls still exercise the real invitation worker.
  class DomainInvitations extends InvitationsService {
    async deliverNext(onlyInvitationId) {
      if (onlyInvitationId) return false;
      return super.deliverNext();
    }
  }
  const auth = new SupabaseAuth(runtime),
    invites = new DomainInvitations(
      runtime,
      auth,
      new Sessions(runtime, auth),
    );
  const recipient = randomUUID();
  await owner.query(
    "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,now())",
    [recipient, "recipient@example.invalid"],
  );
  const priorExternalEnv = {};
  for (const key of [
    "EXTERNAL_TEST_RECIPIENTS",
    "LOCAL_DEVELOPMENT",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
  ])
    priorExternalEnv[key] = process.env[key];
  process.env.EXTERNAL_TEST_RECIPIENTS = "recipient@example.invalid";
  process.env.LOCAL_DEVELOPMENT = "true";
  process.env.SUPABASE_SECRET_KEY ??= "isolated-transport-only";
  process.env.SUPABASE_PUBLISHABLE_KEY ??= "isolated-transport-only";
  class DomainExternalRequests extends ExternalRequestsService {
    sent = 0;
    // Suppress the production fire-and-forget kick for deterministic isolated QA.
    // Explicit deliverNext() calls below still exercise the real queue, leases,
    // locking, sending, audit and state-transition implementation.
    async deliverNext(onlyRequestId) {
      if (onlyRequestId) return false;
      return super.deliverNext();
    }
    async sendEmail() {
      this.sent++;
      return null;
    }
  }
  const external = new DomainExternalRequests(
    runtime,
    auth,
    new ExternalSessions(runtime),
  );
  const extInput = { expectedContactRevision: 2, requestKey: randomUUID() };
  await assert.rejects(
    external.create(outsider, contactAssignment, extInput),
    (e) => e.getStatus() === 404,
  );
  await assert.rejects(
    external.create(employee, assigned, extInput),
    (e) => e.getStatus() === 403,
  );
  await assert.rejects(
    external.create(employee, contactAssignment, {
      ...extInput,
      expectedContactRevision: 1,
    }),
    (e) => e.getStatus() === 409,
  );
  const firstExternal = await external.create(
    employee,
    contactAssignment,
    extInput,
  );
  assert.equal(
    (await external.create(employee, contactAssignment, extInput)).id,
    firstExternal.id,
  );
  await assert.rejects(
    external.create(employee, contactAssignment, {
      ...extInput,
      replaceRequestId: randomUUID(),
    }),
    (e) => e.getStatus() === 409,
  );
  await external.revoke(employee, contactAssignment, firstExternal.id);
  const extCreateRaces = await Promise.allSettled(
    [1, 2].map(() =>
      external.create(employee, contactAssignment, {
        expectedContactRevision: 2,
        requestKey: randomUUID(),
      }),
    ),
  );
  assert.equal(
    extCreateRaces.filter((r) => r.status === "fulfilled").length,
    1,
  );
  const secondExternal = extCreateRaces.find(
    (r) => r.status === "fulfilled",
  ).value;
  assert.equal(
    (
      await Promise.all([external.deliverNext(), external.deliverNext()])
    ).filter(Boolean).length,
    1,
  );
  assert.equal(external.sent, 1);
  assert.equal(
    (
      await runtime.externalRequest.findUniqueOrThrow({
        where: { id: secondExternal.id },
      })
    ).state,
    "SENT",
  );
  await owner.query(
    'UPDATE public."ExternalRequest" SET state=\'ACTIVE\',"respondentId"=$1,"updatedBy"=$1 WHERE id=$2',
    [recipient, secondExternal.id],
  );
  const externalEmailSessions = new ExternalSessions(runtime);
  const guest = await runtime.$transaction(async (tx) =>
    externalEmailSessions.issue(
      tx,
      await tx.user.findUniqueOrThrow({ where: { id: recipient } }),
      secondExternal.id,
      new Date(secondExternal.expiresAt),
    ),
  );
  const guestRow = await runtime.externalEmailSession.findUniqueOrThrow({
    where: { tokenHash: digest(guest.token) },
  });
  await assert.rejects(
    owner.query(
      'UPDATE public."ExternalEmailSession" SET "requestId"=$1 WHERE id=$2',
      [firstExternal.id, guestRow.id],
    ),
    /immutable/,
  );
  await assert.rejects(
    owner.query(
      'UPDATE public."ExternalEmailSession" SET "expiresAt"="expiresAt"+interval \'1 hour\' WHERE id=$1',
      [guestRow.id],
    ),
    /immutable/,
  );
  console.log(
    "PASS: isolated email-session scope and expiry cannot be reassigned or extended; provider proof verified separately in the real-Auth browser test.",
  );
  const scoped = {
    actor: { id: recipient, email: "recipient@example.invalid" },
    externalRequestId: secondExternal.id,
  };
  await assert.rejects(
    external.get({ actor: { id: employee, email: profile.email } }),
    (e) => e.getStatus() === 403,
  );
  await assert.rejects(
    external.get({
      ...scoped,
      actor: { id: outsider, email: "other@example.invalid" },
    }),
    (e) => e.getStatus() === 403,
  );
  await assert.rejects(
    external.submit(scoped, { expectedRevision: 0, requestKey: randomUUID() }),
    (e) => e.getStatus() === 400,
  );
  const extSaves = await Promise.allSettled(
    [1, 2].map(() =>
      external.save(scoped, {
        expectedRevision: 0,
        answers: { [externalQuestion.id]: "Independent response" },
      }),
    ),
  );
  assert.equal(extSaves.filter((r) => r.status === "fulfilled").length, 1);
  const extSubmit = { expectedRevision: 1, requestKey: randomUUID() };
  const extSubmits = await Promise.all([
    external.submit(scoped, extSubmit),
    external.submit(scoped, extSubmit),
  ]);
  assert.ok(extSubmits.every((r) => r.state === "SUBMITTED"));
  assert.equal(
    await runtime.externalSubmission.count({
      where: { requestId: secondExternal.id },
    }),
    1,
  );
  await assert.rejects(
    external.save(scoped, { expectedRevision: 2, answers: {} }),
    (e) => e.getStatus() === 409,
  );
  await assert.rejects(
    external.revoke(employee, contactAssignment, secondExternal.id),
    (e) => e.getStatus() === 409,
  );
  const statusOnly = (await external.list(employee, contactAssignment))
    .items[0];
  assert.equal("answers" in statusOnly, false);
  assert.equal("respondentId" in statusOnly, false);
  await assert.rejects(
    owner.query(
      'UPDATE public."ExternalSubmission" SET answers=\'{}\' WHERE "requestId"=$1',
      [secondExternal.id],
    ),
    /immutable/,
  );
  await assert.rejects(
    owner.query(
      "UPDATE public.\"ExternalRequest\" SET email='different@example.invalid' WHERE id=$1",
      [secondExternal.id],
    ),
    /immutable/,
  );
  const scopedSession = randomUUID();
  await owner.query(
    'INSERT INTO public."Session"(id,"tokenHash","csrfHash","userId","expiresAt") VALUES($1,$2,$3,$4,now()+interval \'1 hour\')',
    [scopedSession, randomUUID(), randomUUID(), recipient],
  );
  await assert.rejects(
    owner.query(
      'UPDATE public."Session" SET "externalRequestId"=$1 WHERE id=$2',
      [secondExternal.id, scopedSession],
    ),
    /scope is immutable/,
  );
  for (const role of ["anon", "authenticated", "service_role"])
    for (const table of [
      "ExternalRequest",
      "ExternalDelivery",
      "ExternalSubmission",
      "ExternalEmailSession",
    ])
      assert.equal(
        (
          await owner.query(
            "SELECT has_table_privilege($1,$2,'SELECT') AS allowed",
            [role, `public."${table}"`],
          )
        ).rows[0].allowed,
        false,
      );
  for (const [key, value] of Object.entries(priorExternalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  console.log(
    "PASS: external request snapshots, replay/concurrency, exclusive delivery claims, scoped text responses, exactly-once immutable submission, employee status privacy and session-scope guards (explicit email transport fixture; no Auth shortcut).",
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

  // Developer migration must protect the one-owner slot without touching
  // existing HR or employee accounts. Everything below is isolated PostgreSQL.
  const developerQa = randomUUID(),
    competingDeveloperQa = randomUUID();
  await owner.query(
    "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ($1,'developer-owner-qa@example.invalid',now()),($2,'developer-second-qa@example.invalid',now())",
    [developerQa, competingDeveloperQa],
  );
  const developerBaseline = await owner.query(
    'SELECT role,"authVersion" FROM public."User" WHERE id=$1',
    [developerQa],
  );
  assert.equal(developerBaseline.rows[0].role, "EMPLOYEE");
  assert.equal(developerBaseline.rows[0].authVersion, 1);
  const privileges = await owner.query(
    "SELECT has_table_privilege('nolt_app','nolt_private.developer_bootstrap','SELECT') AS runtime_read, has_table_privilege('authenticated','nolt_private.developer_bootstrap','SELECT') AS auth_read",
  );
  assert.equal(privileges.rows[0].runtime_read, false);
  assert.equal(privileges.rows[0].auth_read, false);

  await owner.query("BEGIN");
  try {
    await owner.query(
      'INSERT INTO nolt_private.developer_bootstrap ("userId","providerSubject","approvedEmail") VALUES($1,$1,$2)',
      [developerQa, "developer-owner-qa@example.invalid"],
    );
    await owner.query(
      'UPDATE public."User" SET role=\'DEVELOPER\', permissions=ARRAY[]::text[] WHERE id=$1',
      [developerQa],
    );
    const checked = await owner.query(
      'SELECT role,"authVersion" FROM public."User" WHERE id=$1',
      [developerQa],
    );
    assert.equal(checked.rows[0].role, "DEVELOPER");
    assert.equal(checked.rows[0].authVersion, 2);
    await owner.query("SAVEPOINT second_developer");
    await assert.rejects(
      owner.query(
        'UPDATE public."User" SET role=\'DEVELOPER\' WHERE id=$1',
        [competingDeveloperQa],
      ),
      (e) => e.code === "23505",
    );
    await owner.query("ROLLBACK TO SAVEPOINT second_developer");
    await owner.query("SAVEPOINT second_bootstrap");
    await assert.rejects(
      owner.query(
        'INSERT INTO nolt_private.developer_bootstrap ("userId","providerSubject","approvedEmail") VALUES($1,$1,$2)',
        [competingDeveloperQa, "developer-second-qa@example.invalid"],
      ),
      (e) => e.code === "23505",
    );
    await owner.query("ROLLBACK TO SAVEPOINT second_bootstrap");
  } finally {
    // Verify a failed/rejected bootstrap leaves no Developer role or claim.
    await owner.query("ROLLBACK");
  }
  const postRollback = await owner.query(
    'SELECT role,"authVersion" FROM public."User" WHERE id=$1',
    [developerQa],
  );
  assert.equal(postRollback.rows[0].role, "EMPLOYEE");
  assert.equal(postRollback.rows[0].authVersion, 1);
  assert.equal(
    (await owner.query("SELECT count(*)::integer AS n FROM nolt_private.developer_bootstrap")).rows[0].n,
    0,
  );
  console.log(
    "PASS: Developer bootstrap single-role and one-time ledger uniqueness, protected runtime privileges, access-version trigger and complete transactional rollback (isolated PostgreSQL).",
  );
  // HR draft constraints are tested in the same temporary database.
  const hrDraftId = randomUUID();
  const hrDraftPrivileges = await owner.query(
    "SELECT has_table_privilege('nolt_app','public.\"HrInvitation\"','DELETE') AS can_delete, has_table_privilege('anon','public.\"HrInvitation\"','SELECT') AS anon_read, has_table_privilege('nolt_app','public.\"HrInvitation\"','INSERT') AS can_insert",
  );
  assert.equal(hrDraftPrivileges.rows[0].can_delete, false);
  assert.equal(hrDraftPrivileges.rows[0].anon_read, false);
  assert.equal(hrDraftPrivileges.rows[0].can_insert, true);
  await owner.query("BEGIN");
  try {
    await owner.query(
      'INSERT INTO public."HrInvitation"(id,email,name,"createdBy") VALUES($1,$2,$3,$4)',
      [hrDraftId, "new-hr-qa@example.invalid", "Temporary HR invitee", developerQa],
    );
    await owner.query("SAVEPOINT duplicate_hr_draft");
    await assert.rejects(
      owner.query(
        'INSERT INTO public."HrInvitation"(email,name,"createdBy") VALUES($1,$2,$3)',
        ["new-hr-qa@example.invalid", "Duplicate HR invitee", developerQa],
      ),
      (e) => e.code === "23505",
    );
    await owner.query("ROLLBACK TO SAVEPOINT duplicate_hr_draft");
    const account = await owner.query(
      'SELECT role FROM public."User" WHERE id=$1',
      [developerQa],
    );
    assert.equal(account.rows[0].role, "EMPLOYEE");
    await owner.query(
      'UPDATE public."HrInvitation" SET state=\'REVOKED\',"revokedAt"=now() WHERE id=$1',
      [hrDraftId],
    );
    assert.equal(
      (await owner.query('SELECT state FROM public."HrInvitation" WHERE id=$1',[hrDraftId])).rows[0].state,
      "REVOKED",
    );
  } finally {
    await owner.query("ROLLBACK");
  }
  assert.equal(
    (await owner.query('SELECT count(*)::int AS n FROM public."HrInvitation"')).rows[0].n,
    0,
  );
  console.log("PASS: HR invitation drafts enforce unique pending email, restricted database privileges, revocation and full rollback without role changes (isolated PostgreSQL).");

  // Simulate delivery states only in a rollback-only fixture. No Auth call or mail.
  await owner.query("BEGIN");
  try {
    await owner.query(
      'INSERT INTO public."HrInvitation"(id,email,name,"createdBy","expiresAt",state,"requestKey") VALUES($1,$2,$3,$4,now()+interval \'30 minutes\',\'QUEUED\',$5)',
      [hrDraftId, "queued-hr-qa@example.invalid", "Queued HR", developerQa, randomUUID()],
    );
    await owner.query("SAVEPOINT duplicate_queued_hr");
    await assert.rejects(
      owner.query(
        'INSERT INTO public."HrInvitation"(email,name,"createdBy") VALUES($1,$2,$3)',
        ["queued-hr-qa@example.invalid", "Duplicate pending HR", developerQa],
      ),
      (e) => e.code === "23505",
    );
    await owner.query("ROLLBACK TO SAVEPOINT duplicate_queued_hr");
    await owner.query("UPDATE public.\"HrInvitation\" SET state='REVOKED',\"revokedAt\"=now() WHERE id=$1", [hrDraftId]);
    await owner.query("SAVEPOINT terminal_hr_state");
    await assert.rejects(
      owner.query("UPDATE public.\"HrInvitation\" SET state='QUEUED',\"revokedAt\"=NULL WHERE id=$1", [hrDraftId]),
      (e) => e.code === "P0001",
    );
    await owner.query("ROLLBACK TO SAVEPOINT terminal_hr_state");
    assert.equal((await owner.query('SELECT role FROM public."User" WHERE id=$1', [developerQa])).rows[0].role,"EMPLOYEE");
  } finally {
    await owner.query("ROLLBACK");
  }
  console.log("PASS: HR invitation queued-email uniqueness, terminal-state protection and zero account role changes (isolated PostgreSQL rollback).");

  // Delivery ledger receives a fabricated provider response only. Disposable isolated DB.
  const ledgerId = randomUUID(), ledgerSubject = randomUUID();
  await owner.query(
    'INSERT INTO public."HrInvitation"(id,email,name,"createdBy",state,"expiresAt") VALUES($1,$2,$3,$4,\'SENDING\',now()+interval \'45 minutes\')',
    [ledgerId, "ledger-hr-qa@example.invalid", "Ledger QA", developerQa],
  );
  // Only a creation-time binding permits a successful delivery result.
  const ledgerSecret = "a".repeat(64);
  await owner.query('UPDATE public."HrInvitation" SET "creationSecretHash"=encode(sha256(convert_to($1,\'UTF8\')),\'hex\') WHERE id=$2',[ledgerSecret,ledgerId]);
  await owner.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)',[ledgerSubject,"ledger-hr-qa@example.invalid",{nolt_hr_creation_secret:ledgerSecret}]);
  const ledger = new HrInvitationDeliveryLedger(runtime);
  assert.equal(await ledger.record(ledgerId,{status:"SENT",providerSubject:ledgerSubject}),true);
  assert.equal(await ledger.record(ledgerId,{status:"SENT",providerSubject:ledgerSubject}),false);
  const recorded = await owner.query(
    'SELECT state,"providerSubject","sentAt" FROM public."HrInvitation" WHERE id=$1',
    [ledgerId],
  );
  assert.equal(recorded.rows[0].state,"SENT");
  assert.equal(recorded.rows[0].providerSubject,ledgerSubject);
  assert.ok(recorded.rows[0].sentAt);
  await owner.query("BEGIN");
  await owner.query("SAVEPOINT premature_acceptance");
  await assert.rejects(
    owner.query('UPDATE public."HrInvitation" SET state=\'ACCEPTED\' WHERE id=$1',[ledgerId]),
    (e) => e.code === "23514",
  );
  await owner.query("ROLLBACK TO SAVEPOINT premature_acceptance");
  await owner.query("ROLLBACK");
  assert.equal((await owner.query('SELECT state FROM public."HrInvitation" WHERE id=$1',[ledgerId])).rows[0].state,"SENT");

  assert.equal((await owner.query('SELECT role FROM public."User" WHERE id=$1',[developerQa])).rows[0].role,"EMPLOYEE");
  assert.equal(
    (await owner.query("SELECT count(*)::int AS n FROM public.\"AuditEvent\" WHERE \"targetId\"=$1 AND action='HR_INVITATION_SENT'",[ledgerId])).rows[0].n,
    1,
  );
  console.log("PASS: HR invitation delivery ledger saves provider subject once, audits outcome and preserves account roles (disposable isolated PostgreSQL, no mail).");

  // A restricted owner-only activation boundary is tested with reversible role changes.
  const activationGrants = await owner.query(
    "SELECT has_function_privilege('nolt_app','nolt_private.accept_hr_invitation(uuid,uuid)','EXECUTE') AS runtime_execute, has_function_privilege('authenticated','nolt_private.accept_hr_invitation(uuid,uuid)','EXECUTE') AS web_execute",
  );
  assert.equal(activationGrants.rows[0].runtime_execute,false);
  assert.equal(activationGrants.rows[0].web_execute,false);
  assert.equal(
    (await owner.query("SELECT nolt_private.accept_hr_invitation($1,$2) AS accepted",[ledgerId,ledgerSubject])).rows[0].accepted,
    false,
  );
  await owner.query("BEGIN");
  try {
    await owner.query("UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1",[ledgerSubject]);
    assert.equal(
      (await owner.query("SELECT nolt_private.accept_hr_invitation($1,$2) AS accepted",[ledgerId,ledgerSubject])).rows[0].accepted,
      true,
    );
    assert.equal(
      (await owner.query("SELECT nolt_private.accept_hr_invitation($1,$2) AS accepted",[ledgerId,ledgerSubject])).rows[0].accepted,
      false,
    );
    assert.equal((await owner.query('SELECT role FROM public."User" WHERE id=$1',[ledgerSubject])).rows[0].role,"HR");
    assert.equal((await owner.query('SELECT state FROM public."HrInvitation" WHERE id=$1',[ledgerId])).rows[0].state,"ACCEPTED");
    assert.equal(
      (await owner.query('SELECT count(*)::int AS n FROM public."AuditEvent" WHERE "targetId"=$1 AND action=\'HR_INVITATION_ACCEPTED\'',[ledgerId])).rows[0].n,
      1,
    );
  } finally {
    await owner.query("ROLLBACK");
  }
  assert.equal((await owner.query('SELECT role FROM public."User" WHERE id=$1',[ledgerSubject])).rows[0].role,"EMPLOYEE");
  assert.equal((await owner.query('SELECT state FROM public."HrInvitation" WHERE id=$1',[ledgerId])).rows[0].state,"SENT");
  console.log("PASS: restricted HR activation function rejects unconfirmed identity, atomically consumes one invitation, denies replay and rolls back role change.");

  // A fabricated successful provider response without a fresh INSERT claim is unsafe.
  const forgedId = randomUUID(), forgedSubject = randomUUID();
  await owner.query(
    'INSERT INTO public."HrInvitation"(id,email,name,"createdBy",state,"expiresAt") VALUES($1,$2,$3,$4,\'SENDING\',now()+interval \'45 minutes\')',
    [forgedId,"forged-hr-qa@example.invalid","Forged QA",developerQa],
  );
  assert.equal(await ledger.record(forgedId,{status:"SENT",providerSubject:forgedSubject}),true);
  const denied = await owner.query('SELECT state,"providerSubject","creationSubject" FROM public."HrInvitation" WHERE id=$1',[forgedId]);
  assert.equal(denied.rows[0].state,"UNCERTAIN");
  assert.equal(denied.rows[0].providerSubject,null);
  assert.equal(denied.rows[0].creationSubject,null);
  console.log("PASS: HR ledger rejects fabricated provider success without new-account creation provenance (isolated PostgreSQL).");

  // Two workers contend on real PostgreSQL locks. The test transport cannot send email.
  const workerId = randomUUID(), workerSubject = randomUUID();
  await owner.query(
    'INSERT INTO public."HrInvitation"(id,email,name,"createdBy",state,"expiresAt") VALUES($1,$2,$3,$4,\'QUEUED\',now()+interval \'45 minutes\')',
    [workerId, "worker-hr-qa@example.invalid", "Worker QA", developerQa],
  );
  let sendCalls = 0;
  class FakeHrWorker extends HrInvitationWorker {
    async send(invitation) {
      assert.equal(invitation.email,"worker-hr-qa@example.invalid");
      assert.match(invitation.creationSecret,/^[a-f0-9]{64}$/);
      sendCalls++;
      await owner.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)',[workerSubject,invitation.email,{nolt_hr_creation_secret:invitation.creationSecret}]);
      await new Promise((resolve) => setTimeout(resolve, 25));
      return {status:"SENT",providerSubject:workerSubject};
    }
  }
  const gateBefore = process.env.HR_INVITATION_DELIVERY_ENABLED;
  const recipientsBefore = process.env.HR_INVITATION_TEST_RECIPIENTS;
  process.env.HR_INVITATION_DELIVERY_ENABLED = "true";
  process.env.HR_INVITATION_TEST_RECIPIENTS = "worker-hr-qa@example.invalid";
  try {
    const workerA = new FakeHrWorker(runtime,ledger), workerB = new FakeHrWorker(runtime,ledger);
    const results = await Promise.all([workerA.deliverNext(),workerB.deliverNext()]);
    assert.equal(results.filter(Boolean).length,1);
    assert.equal(sendCalls,1);
    const stored = await owner.query(
      'SELECT state,"providerSubject","deliveryAttempts" FROM public."HrInvitation" WHERE id=$1',
      [workerId],
    );
    assert.deepEqual(
      [stored.rows[0].state,stored.rows[0].providerSubject,stored.rows[0].deliveryAttempts],
      ["SENT",workerSubject,1],
    );
    assert.equal((await owner.query('SELECT role FROM public."User" WHERE id=$1',[developerQa])).rows[0].role,"EMPLOYEE");
  } finally {
    if (gateBefore === undefined) delete process.env.HR_INVITATION_DELIVERY_ENABLED;
    else process.env.HR_INVITATION_DELIVERY_ENABLED = gateBefore;
    if (recipientsBefore === undefined) delete process.env.HR_INVITATION_TEST_RECIPIENTS;
    else process.env.HR_INVITATION_TEST_RECIPIENTS = recipientsBefore;
  }
  console.log("PASS: concurrent HR workers exclusively claim one queued invite, call synthetic transport once, bind subject and preserve roles (no email or Auth call).");

  // Revocation and acceptance are mutually exclusive; no provider calls or promotion.
  const revokeId = randomUUID();
  await owner.query(
    'INSERT INTO public."HrInvitation"(id,email,name,"createdBy",state,"expiresAt","providerSubject","acceptedAt","acceptedBy") VALUES($1,$2,$3,$4,\'ACCEPTED\',now()+interval \'20 minutes\',$5,now(),$5)',
    [revokeId, "accepted-hr-qa@example.invalid", "Accepted QA", developerQa, developerQa],
  );
  const developerService = new DeveloperOverviewService(runtime);
  await assert.rejects(
    developerService.revoke(developerQa,revokeId),
    (e) => e?.status === 409,
  );
  assert.equal(
    (await owner.query('SELECT state,"revokedAt" FROM public."HrInvitation" WHERE id=$1',[revokeId])).rows[0].state,
    "ACCEPTED",
  );
  const draftToRevoke = randomUUID();
  await owner.query(
    'INSERT INTO public."HrInvitation"(id,email,name,"createdBy") VALUES($1,$2,$3,$4)',
    [draftToRevoke, "revokable-hr-qa@example.invalid", "Revokable QA", developerQa],
  );
  assert.equal((await developerService.revoke(developerQa,draftToRevoke)).state,"REVOKED");
  assert.equal((await developerService.revoke(developerQa,draftToRevoke)).state,"REVOKED");
  assert.equal(
    (await owner.query('SELECT count(*)::int AS n FROM public."AuditEvent" WHERE "targetId"=$1 AND action=\'HR_INVITATION_DRAFT_REVOKED\'',[draftToRevoke])).rows[0].n,
    1,
  );
  console.log("PASS: locked HR revocation rejects accepted invitations, is idempotent for revoked drafts and emits one audit event (disposable PostgreSQL).");



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
