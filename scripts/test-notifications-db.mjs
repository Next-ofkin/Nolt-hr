// Disposable-database check that the notification bell's queries run and return the right lines.
import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
const dir = resolve(".local/notif-qa", randomUUID()); mkdirSync(dir, { recursive: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "qa-owner", port: 54351, persistent: false,
  authMethod: "scram-sha-256", postgresFlags: ["-h", "127.0.0.1"], createPostgresUser: true, onLog: () => {}, onError: () => {} });
let db, prisma;
try {
  await server.initialise(); await server.start();
  db = server.getPgClient(); await db.connect();
  await db.query("CREATE ROLE nolt_app LOGIN PASSWORD 'qa-app' NOSUPERUSER; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;");
  for (const n of readdirSync("database/migrations").filter(n => /^\d/.test(n)).sort())
    await db.query(readFileSync(`database/migrations/${n}/migration.sql`, "utf8"));
  const id = () => randomUUID();
  const [hr, emp, employee, kase, gForm, gVer, gAsg, eForm, eVer, eAsg, eForm2, eVer2, eAsg2] = Array.from({ length: 13 }, id);
  await db.query(`SET session_replication_role = replica;
    INSERT INTO "User"(id,email,name,role) VALUES ('${hr}','hr@x.test','HR','HR'),('${emp}','e@x.test','Ada','EMPLOYEE');
    INSERT INTO "Employee"(id,"userId",email,"fullName","jobTitle",department,"employmentType","startDate","createdBy") VALUES ('${employee}','${emp}','e@x.test','Ada Okoye','J','D','T',now(),'${hr}');
    INSERT INTO "OnboardingCase"(id,"employeeId","createdBy") VALUES ('${kase}','${employee}','${hr}');
    INSERT INTO "Form"(id,"createdBy") VALUES ('${gForm}','${hr}'),('${eForm}','${hr}'),('${eForm2}','${hr}');
    INSERT INTO "FormVersion"(id,"formId",version,status,title,recipient,fields,"updatedAt","publishedAt") VALUES
      ('${gVer}','${gForm}',1,'PUBLISHED','Guarantor Form','GUARANTOR','[]',now(),now()),
      ('${eVer}','${eForm}',1,'PUBLISHED','Bio data','EMPLOYEE','[]',now(),now()),
      ('${eVer2}','${eForm2}',1,'PUBLISHED','Tax form','EMPLOYEE','[]',now(),now());
    INSERT INTO "FormAssignment"(id,"caseId","formId","formVersionId","assignedBy") VALUES
      ('${gAsg}','${kase}','${gForm}','${gVer}','${hr}'),('${eAsg}','${kase}','${eForm}','${eVer}','${hr}'),('${eAsg2}','${kase}','${eForm2}','${eVer2}','${hr}');
    INSERT INTO "EmployeeResponse"("assignmentId",status,"updatedBy") VALUES ('${eAsg}','SUBMITTED','${emp}');
    INSERT INTO "ExternalRequest"(id,"assignmentId","requestKey","requestHash","contactRevision",slot,"fullName",email,"createdBy","updatedBy","expiresAt",state,"sentAt")
      VALUES ('${id()}','${gAsg}','${id()}','h',1,1,'Kemi Bello','k@x.test','${emp}','${emp}',now()+interval '5 days','SENT',now()-interval '3 days');
    SET session_replication_role = origin;`);

  process.env.DATABASE_URL = "postgresql://postgres:qa-owner@127.0.0.1:54351/postgres";
  const { Database } = await import("../apps/api/dist/database.js");
  const { NotificationsService } = await import("../apps/api/dist/notifications.js");
  prisma = new Database();
  const svc = new NotificationsService(prisma);
  const actor = (role, permissions, uid) => ({ id: uid, role, permissions, email: "", name: "", externalRequestId: null, mfaVerified: true, authMethod: "password", expiresAt: "" });

  const mine = await svc.forUser(actor("EMPLOYEE", ["profile.own"], emp));
  console.log(mine.items.map(i => `${i.kind}: ${i.title}`));
  assert.deepEqual(mine.items.map(i => i.kind), ["late", "action"]);
  assert.match(mine.items[0].title, /Kemi Bello has not replied/);
  assert.match(mine.items[1].title, /Fill in: Tax form/);
  assert.equal(mine.count, 2);
  console.log("ok: the employee sees the late guarantor and the form to fill, not the submitted one");

  const hrAll = await svc.forUser(actor("HR", ["forms.manage", "employees.manage", "reviews.assigned"], hr));
  console.log(hrAll.items.map(i => `${i.kind}: ${i.title} | ${i.detail}`));
  assert.deepEqual(hrAll.items.map(i => i.id.split(":").slice(1).join(":")), ["1:late", "review"]);
  assert.equal(hrAll.items[1].href, `/employees?employee=${employee}`);
  console.log("ok: HR sees the late guarantor and the form waiting for review");

  await assert.rejects(svc.forUser(actor("DEVELOPER", ["hr.accounts.manage"], id())), /No notifications/);
  console.log("ok: other accounts get a clear refusal");
  console.log("All notification database checks passed.");
} finally {
  await prisma?.$disconnect().catch(() => {}); await db?.end().catch(() => {}); await server.stop().catch(() => {});
}
