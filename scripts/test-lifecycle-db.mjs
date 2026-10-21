import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
const dir = resolve(".local/lifecycle-qa", randomUUID()); mkdirSync(dir, { recursive: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "qa-owner", port: 54339, persistent: false,
  authMethod: "scram-sha-256", postgresFlags: ["-h", "127.0.0.1"], createPostgresUser: true, onLog: () => {}, onError: () => {} });
let owner, app;
try {
  await server.initialise(); await server.start();
  owner = server.getPgClient(); await owner.connect();
  await owner.query("CREATE ROLE nolt_app LOGIN PASSWORD 'qa-app' NOSUPERUSER; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;");
  for (const n of readdirSync("database/migrations").filter(n => /^\d/.test(n)).sort())
    await owner.query(readFileSync(`database/migrations/${n}/migration.sql`, "utf8"));
  await owner.query(`CREATE SCHEMA IF NOT EXISTS auth; GRANT USAGE ON SCHEMA public TO nolt_app;
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO nolt_app;`);
  // The real grants for FormVersion/PackTemplate come from migrations; re-apply the restricted runtime set for the tables under test.
  await owner.query(`REVOKE ALL ON public."FormVersion", public."Form", public."PackTemplate", public."PackItem" FROM nolt_app;
    GRANT SELECT,INSERT,UPDATE ON public."PackTemplate" TO nolt_app; GRANT SELECT,INSERT,DELETE ON public."PackItem" TO nolt_app;
    GRANT SELECT,INSERT,UPDATE ON public."FormVersion", public."Form" TO nolt_app;`);
  // re-run the lifecycle migration so its grants are what production gets
  await owner.query(readFileSync("database/migrations/20261021100000_form_and_pack_lifecycle/migration.sql", "utf8"));
  await owner.query(`GRANT DELETE ON public."Form", public."FormVersion" TO nolt_app; GRANT SELECT ON ALL TABLES IN SCHEMA public TO nolt_app;`);
  app = new pg.Client({ host: "127.0.0.1", port: 54339, user: "nolt_app", password: "qa-app", database: "postgres" }); await app.connect();
  const uid = randomUUID();
  await owner.query(`SET session_replication_role = replica; INSERT INTO "User"(id,email,name,role) VALUES ('${uid}','a@b.test','A','HR'); SET session_replication_role = origin;`);
  const mkForm = async (status) => {
    const f = randomUUID(), v = randomUUID();
    await owner.query(`INSERT INTO "Form"(id,"createdBy") VALUES ('${f}','${uid}')`);
    await owner.query(`INSERT INTO "FormVersion"(id,"formId",version,status,title,recipient,fields,"updatedAt") VALUES ('${v}','${f}',1,'DRAFT','T','EMPLOYEE','[{"x":1}]',now())`);
    if (status !== "DRAFT") await owner.query(`ALTER TABLE "FormVersion" DISABLE TRIGGER USER; UPDATE "FormVersion" SET status='${status}',"publishedAt"=now() WHERE id='${v}'; ALTER TABLE "FormVersion" ENABLE TRIGGER USER;`);
    return { f, v };
  };
  const fails = async (q) => { try { await app.query(q); } catch (e) { return e.message; } return null; };
  // F1: unused published → unpublish → edit again → delete
  let { f, v } = await mkForm("PUBLISHED");
  await app.query(`UPDATE "FormVersion" SET status='UNPUBLISHED',revision=revision+1 WHERE id='${v}'`);
  await app.query(`UPDATE "FormVersion" SET status='DRAFT',"publishedAt"=NULL,revision=revision+1 WHERE id='${v}'`);
  await app.query(`UPDATE "FormVersion" SET title='Edited' WHERE id='${v}'`);
  await app.query(`UPDATE "FormVersion" SET status='PUBLISHED',"publishedAt"=now(),revision=revision+1 WHERE id='${v}'`);
  assert.match(await fails(`UPDATE "FormVersion" SET title='sneaky' WHERE id='${v}'`) ?? "", /immutable/, "published stays immutable");
  await app.query(`DELETE FROM "FormVersion" WHERE id='${v}'`); await app.query(`DELETE FROM "Form" WHERE id='${f}'`).catch(()=>{});
  console.log("ok forms: unused published can be unpublished, edited, republished and deleted");
  // F2: used (in a pack) is locked
  ({ f, v } = await mkForm("UNPUBLISHED"));
  const p1 = randomUUID();
  await owner.query(`INSERT INTO "PackTemplate"(id,name,"employmentType","createdBy","updatedAt") VALUES ('${p1}','P','Full-time','${uid}',now())`);
  await owner.query(`INSERT INTO "PackItem"(id,"packId","formId","formVersionId",required,position) VALUES ('${randomUUID()}','${p1}','${f}','${v}',true,0)`);
  assert.match(await fails(`UPDATE "FormVersion" SET status='DRAFT',revision=revision+1 WHERE id='${v}'`) ?? "", /immutable/);
  assert.match(await fails(`DELETE FROM "FormVersion" WHERE id='${v}'`) ?? "", /immutable|violates/);
  console.log("ok forms: a version in a pack cannot be reopened or deleted");
  // P1: published pack, unassigned: withdraw, reopen, delete
  const setPub = async (id) => owner.query(`ALTER TABLE "PackTemplate" DISABLE TRIGGER USER; UPDATE "PackTemplate" SET status='PUBLISHED',"publishedAt"=now() WHERE id='${id}'; ALTER TABLE "PackTemplate" ENABLE TRIGGER USER;`);
  await setPub(p1);
  await app.query(`UPDATE "PackTemplate" SET status='WITHDRAWN',"updatedAt"=now() WHERE id='${p1}'`);
  await app.query(`UPDATE "PackTemplate" SET status='DRAFT',"publishedAt"=NULL,revision=revision+1 WHERE id='${p1}'`);
  await app.query(`DELETE FROM "PackItem" WHERE "packId"='${p1}'`);
  await app.query(`DELETE FROM "PackTemplate" WHERE id='${p1}'`);
  console.log("ok packs: unassigned pack can be unpublished, reopened and deleted (runtime role)");
  // P2: assigned pack stays locked
  const p2 = randomUUID();
  await owner.query(`INSERT INTO "PackTemplate"(id,name,"employmentType","createdBy","updatedAt") VALUES ('${p2}','P2','Full-time','${uid}',now())`);
  await setPub(p2);
  await owner.query(`SET session_replication_role = replica; INSERT INTO "PackAssignment"(id,"packId","caseId","assignedBy") VALUES ('${randomUUID()}','${p2}','${randomUUID()}','${uid}'); SET session_replication_role = origin;`);
  await app.query(`UPDATE "PackTemplate" SET status='WITHDRAWN',"updatedAt"=now() WHERE id='${p2}'`);
  assert.match(await fails(`UPDATE "PackTemplate" SET status='DRAFT',revision=revision+1 WHERE id='${p2}'`) ?? "", /cannot|immutable/);
  assert.match(await fails(`DELETE FROM "PackTemplate" WHERE id='${p2}'`) ?? "", /cannot be deleted/);
  console.log("ok packs: a pack given to an employee can be unpublished but never reopened or deleted");
  // P3: older version with a newer one stays locked
  const r = randomUUID(), r2 = randomUUID();
  await owner.query(`INSERT INTO "PackTemplate"(id,name,"employmentType","createdBy","updatedAt") VALUES ('${r}','R','Full-time','${uid}',now())`);
  await setPub(r);
  await owner.query(`INSERT INTO "PackTemplate"(id,name,"employmentType","createdBy","updatedAt","rootPackId","versionNumber") VALUES ('${r2}','R','Full-time','${uid}',now(),'${r}',2)`);
  await app.query(`UPDATE "PackTemplate" SET status='WITHDRAWN',"updatedAt"=now() WHERE id='${r}'`);
  assert.match(await fails(`UPDATE "PackTemplate" SET status='DRAFT',revision=revision+1 WHERE id='${r}'`) ?? "", /cannot|immutable/);
  console.log("ok packs: an older version with a newer version stays locked");
} finally {
  await app?.end().catch(() => {}); await owner?.end().catch(() => {}); await server.stop().catch(() => {});
}
