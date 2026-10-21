// Disposable-database check of the signature guard for guarantors/references.
// Applies every migration to a throwaway PostgreSQL and tests the trigger directly.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
const dir = resolve(".local/extsig-qa", randomUUID()); mkdirSync(dir, { recursive: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "qa-owner", port: 54349, persistent: false,
  authMethod: "scram-sha-256", postgresFlags: ["-h", "127.0.0.1"], createPostgresUser: true, onLog: () => {}, onError: () => {} });
let db;
try {
  await server.initialise(); await server.start();
  db = server.getPgClient(); await db.connect();
  await db.query("CREATE ROLE nolt_app LOGIN PASSWORD 'qa-app' NOSUPERUSER; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;");
  for (const n of readdirSync("database/migrations").filter(n => /^\d/.test(n)).sort())
    await db.query(readFileSync(`database/migrations/${n}/migration.sql`, "utf8"));
  const id = () => randomUUID();
  const [hr, emp, guar, other] = [id(), id(), id(), id()];
  const [employee, kase, form, ver, asg, req] = [id(), id(), id(), id(), id(), id()];
  const fixtures = async (state = "ACTIVE", recipient = "GUARANTOR", expires = "now() + interval '1 day'") => {
    const a = id(), r = id(), v = id(), f = id();
    await db.query(`SET session_replication_role = replica;
      INSERT INTO "Form"(id,"createdBy") VALUES ('${f}','${hr}');
      INSERT INTO "FormVersion"(id,"formId",version,status,title,recipient,fields,"updatedAt","publishedAt") VALUES ('${v}','${f}',1,'PUBLISHED','G','${recipient}','[]',now(),now());
      INSERT INTO "FormAssignment"(id,"caseId","formId","formVersionId","assignedBy") VALUES ('${a}','${kase}','${f}','${v}','${hr}');
      INSERT INTO "ExternalRequest"(id,"assignmentId","requestKey","requestHash","contactRevision","fullName",email,"createdBy","updatedBy","respondentId",state,"expiresAt")
        VALUES ('${r}','${a}','${id()}','h',1,'G','g@x.test','${emp}','${emp}','${guar}','${state}',${expires});
      SET session_replication_role = origin;`);
    return a;
  };
  await db.query(`SET session_replication_role = replica;
    INSERT INTO "User"(id,email,name,role) VALUES ('${hr}','hr@x.test','HR','HR'),('${emp}','e@x.test','E','EMPLOYEE'),('${guar}','g@x.test','G','EMPLOYEE'),('${other}','o@x.test','O','EMPLOYEE');
    INSERT INTO "Employee"(id,"userId",email,"fullName","jobTitle",department,"employmentType","startDate","createdBy") VALUES ('${employee}','${emp}','e@x.test','E','J','D','T',now(),'${hr}');
    INSERT INTO "OnboardingCase"(id,"employeeId","createdBy") VALUES ('${kase}','${employee}','${hr}');
    INSERT INTO "Form"(id,"createdBy") VALUES ('${form}','${hr}');
    SET session_replication_role = origin;`);
  const sign = async (assignmentId, signer, role, uploader = signer) => {
    const file = id();
    await db.query(`INSERT INTO "StoredFile"(id,"assignmentId","fieldId","uploadedBy",purpose,"storageKey","fileName","mimeType","byteSize",sha256,"scanStatus",status,"requestKey","expiresAt","confirmedAt")
      VALUES ('${file}','${assignmentId}','${id()}','${uploader}','SIGNATURE_IMAGE','k/${file}','s.png','image/png',100,'${"a".repeat(64)}','CLEAN','CONFIRMED','${id()}',now(),now())`);
    return db.query(`INSERT INTO "SignatureEvidence"(id,"assignmentId","formVersionId","fieldId","signerId","signerRole","signingMethod","consentVersion","sourceRevision","contentDigest","fileId")
      VALUES ('${id()}','${assignmentId}',(SELECT "formVersionId" FROM "FormAssignment" WHERE id='${assignmentId}'),'${id()}','${signer}','${role}','DRAWN','v1',0,'${"d".repeat(64)}','${file}')`);
  };
  const fails = async (p) => { try { await p; } catch (e) { return e.message; } return null; };

  let a = await fixtures();
  await sign(a, guar, "GUARANTOR");
  console.log("ok: the guarantor on an active request can sign");
  a = await fixtures();
  assert.match(await fails(sign(a, other, "GUARANTOR")) ?? "", /not authorized/);
  console.log("ok: a different person cannot sign for that request");
  a = await fixtures("SUBMITTED");
  assert.match(await fails(sign(a, guar, "GUARANTOR")) ?? "", /not authorized/);
  console.log("ok: no signing after the request is submitted");
  a = await fixtures("ACTIVE", "GUARANTOR", "now() - interval '1 minute'");
  assert.match(await fails(sign(a, guar, "GUARANTOR")) ?? "", /not authorized/);
  console.log("ok: no signing after the link has expired");
  a = await fixtures("ACTIVE", "REFERENCE");
  assert.match(await fails(sign(a, guar, "GUARANTOR")) ?? "", /not authorized/);
  await sign(a, guar, "REFERENCE");
  console.log("ok: the signer role must match the form's recipient");
  a = await fixtures();
  assert.match(await fails(sign(a, guar, "GUARANTOR", other)) ?? "", /uploaded by the signer/);
  console.log("ok: the signature file must have been uploaded by the signer");
  a = await fixtures();
  assert.match(await fails(sign(a, guar, "HR")) ?? "", /signerRole|Unknown signer role/);
  console.log("ok: unknown roles are refused");
  // Employees still work exactly as before.
  const empAsg = id();
  await db.query(`SET session_replication_role = replica;
    INSERT INTO "FormVersion"(id,"formId",version,status,title,recipient,fields,"updatedAt","publishedAt") VALUES ('${ver}','${form}',1,'PUBLISHED','E','EMPLOYEE','[]',now(),now());
    INSERT INTO "FormAssignment"(id,"caseId","formId","formVersionId","assignedBy") VALUES ('${empAsg}','${kase}','${form}','${ver}','${hr}');
    SET session_replication_role = origin;`);
  await sign(empAsg, emp, "EMPLOYEE");
  assert.match(await fails(sign(empAsg, other, "EMPLOYEE")) ?? "", /not authorized/);
  console.log("ok: employee signing is unchanged");
  console.log("All external signature guard checks passed.");
} finally {
  await db?.end().catch(() => {}); await server.stop().catch(() => {});
}
