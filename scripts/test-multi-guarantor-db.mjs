// Disposable-database check of the multi-guarantor rules (slots, "how many needed",
// no contact draft, and the 7-day extension when a guarantor opens the link).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
const dir = resolve(".local/multig-qa", randomUUID()); mkdirSync(dir, { recursive: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "qa-owner", port: 54350, persistent: false,
  authMethod: "scram-sha-256", postgresFlags: ["-h", "127.0.0.1"], createPostgresUser: true, onLog: () => {}, onError: () => {} });
let db;
try {
  await server.initialise(); await server.start();
  db = server.getPgClient(); await db.connect();
  await db.query("CREATE ROLE nolt_app LOGIN PASSWORD 'qa-app' NOSUPERUSER; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;");
  for (const n of readdirSync("database/migrations").filter(n => /^\d/.test(n)).sort())
    await db.query(readFileSync(`database/migrations/${n}/migration.sql`, "utf8"));
  const id = () => randomUUID();
  const [hr, emp, g1, g2, employee, kase, form, ver, asg, empForm, empVer, empAsg] = Array.from({ length: 12 }, id);
  await db.query(`SET session_replication_role = replica;
    INSERT INTO "User"(id,email,name,role) VALUES ('${hr}','hr@x.test','HR','HR'),('${emp}','e@x.test','E','EMPLOYEE'),('${g1}','g1@x.test','G1','EMPLOYEE'),('${g2}','g2@x.test','G2','EMPLOYEE');
    INSERT INTO "Employee"(id,"userId",email,"fullName","jobTitle",department,"employmentType","startDate","createdBy") VALUES ('${employee}','${emp}','e@x.test','E','J','D','T',now(),'${hr}');
    INSERT INTO "OnboardingCase"(id,"employeeId","createdBy") VALUES ('${kase}','${employee}','${hr}');
    INSERT INTO "Form"(id,"createdBy") VALUES ('${form}','${hr}'),('${empForm}','${hr}');
    INSERT INTO "FormVersion"(id,"formId",version,status,title,recipient,fields,"updatedAt","publishedAt") VALUES
      ('${ver}','${form}',1,'PUBLISHED','G','GUARANTOR','[]',now(),now()),('${empVer}','${empForm}',1,'PUBLISHED','E','EMPLOYEE','[]',now(),now());
    INSERT INTO "FormAssignment"(id,"caseId","formId","formVersionId","assignedBy") VALUES ('${asg}','${kase}','${form}','${ver}','${hr}'),('${empAsg}','${kase}','${empForm}','${empVer}','${hr}');
    SET session_replication_role = origin;`);
  const insert = (slot, email = "g1@x.test", expires = "now() + interval '1 hour'") => {
    const rid = id();
    return db.query(`INSERT INTO "ExternalRequest"(id,"assignmentId","requestKey","requestHash","contactRevision",slot,"fullName",email,"createdBy","updatedBy","expiresAt")
      VALUES ('${rid}','${asg}','${id()}','h',1,${slot},'Name','${email}','${emp}','${emp}',${expires}) RETURNING id`).then(r => r.rows[0].id);
  };
  const fails = async (p) => { try { await p; } catch (e) { return e.message; } return null; };

  const first = await insert(1);
  console.log("ok: slot 1 can be sent without a saved contact draft");
  assert.match(await fails(insert(2, "g2@x.test")) ?? "", /owner or slot is invalid/);
  console.log("ok: slot 2 is refused until HR asks for two guarantors");
  assert.match(await fails(db.query(`INSERT INTO "AssignmentGuarantorRule"("assignmentId",required,"updatedBy") VALUES ('${empAsg}',2,'${hr}')`)) ?? "", /active guarantor or reference/);
  console.log("ok: the rule only applies to guarantor and reference forms");
  await db.query(`INSERT INTO "AssignmentGuarantorRule"("assignmentId",required,"updatedBy") VALUES ('${asg}',2,'${hr}')`);
  const second = await insert(2, "g2@x.test");
  console.log("ok: slot 2 works once HR asks for two");
  assert.match(await fails(insert(1, "other@x.test")) ?? "", /ExternalRequest_current_slot/);
  console.log("ok: only one open request per slot");
  assert.match(await fails(insert(3, "g3@x.test")) ?? "", /slot_check|violates check|owner or slot is invalid/);
  console.log("ok: no third slot");
  assert.match(await fails(insert(1, "e@x.test")) ?? "", /ExternalRequest_current_slot|owner or slot is invalid/);
  await db.query(`UPDATE "ExternalRequest" SET state='REVOKED',"revokedAt"=now() WHERE id='${first}'`);
  assert.match(await fails(insert(1, "e@x.test")) ?? "", /owner or slot is invalid/);
  console.log("ok: the employee cannot be their own guarantor");
  const third = await insert(1, "g3@x.test");
  console.log("ok: a revoked slot can be filled again with someone new");
  assert.match(await fails(db.query(`UPDATE "ExternalRequest" SET slot=1 WHERE id='${second}'`)) ?? "", /immutable/);
  console.log("ok: a request cannot move to another slot");

  // Opening the link extends the window to 7 days, and nothing else may change the expiry.
  const step = (rid, state, extra = "") => db.query(`UPDATE "ExternalRequest" SET state='${state}'${extra} WHERE id='${rid}'`);
  await step(second, "SENDING"); await step(second, "SENT");
  assert.match(await fails(step(second, "ACTIVE", `,"respondentId"='${g2}',"updatedBy"='${g2}',"expiresAt"=now()+interval '10 days'`)) ?? "", /expiry is immutable/);
  console.log("ok: the extension is capped");
  await step(second, "ACTIVE", `,"respondentId"='${g2}',"updatedBy"='${g2}',"expiresAt"=now()+interval '7 days'`);
  console.log("ok: opening the link extends the request to 7 days");
  assert.match(await fails(step(third, "SENDING", `,"expiresAt"=now()+interval '3 days'`)) ?? "", /expiry is immutable/);
  console.log("ok: expiry cannot change at any other time");
  console.log("All multi-guarantor database checks passed.");
} finally {
  await db?.end().catch(() => {}); await server.stop().catch(() => {});
}
