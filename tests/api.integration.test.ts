import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { config } from "dotenv";
import { createField } from "@nolt/form-schemas";
config({ quiet: true });
const base = "http://127.0.0.1:4000/api/v1";
async function login(role: "HR" | "EMPLOYEE") {
  const response = await fetch(`${base}/auth/local-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  assert.equal(response.status, 201);
  const data = await response.json();
  return {
    cookie: response.headers.get("set-cookie")!.split(";")[0],
    csrf: data.csrfToken,
  };
}
function headers(session: { cookie: string; csrf: string }) {
  return {
    Cookie: session.cookie,
    "x-csrf-token": session.csrf,
    "Content-Type": "application/json",
  };
}
test("PostgreSQL-backed HR authoring preserves versions, audit, permissions and concurrency", async () => {
  assert.equal(
    process.env.LOCAL_DEVELOPMENT,
    "true",
    "Integration suite must use synthetic local development.",
  );
  assert.notEqual(process.env.NODE_ENV, "production");
  assert.equal((await fetch(`${base}/health/ready`)).status, 200);
  assert.equal((await fetch(`${base}/forms`)).status, 401);
  assert.equal(
    (
      await fetch(`${base}/auth/local-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://untrusted.example",
        },
        body: '{"role":"HR"}',
      })
    ).status,
    403,
  );
  const hr = await login("HR"),
    employee = await login("EMPLOYEE");
  assert.equal(
    (await fetch(`${base}/forms`, { headers: headers(employee) })).status,
    403,
  );
  assert.equal(
    (
      await fetch(`${base}/forms`, {
        method: "POST",
        headers: { Cookie: hr.cookie, "Content-Type": "application/json" },
        body: '{"title":"No CSRF"}',
      })
    ).status,
    403,
  );
  const create = await fetch(`${base}/forms`, {
    method: "POST",
    headers: headers(hr),
    body: JSON.stringify({
      title: `Integration form ${randomUUID()}`,
      recipient: "GUARANTOR",
    }),
  });
  assert.equal(create.status, 201);
  const form = await create.json();
  const field = { ...createField("signature", randomUUID()), required: true };
  const content = {
    title: form.title,
    description: "Synthetic test",
    recipient: "GUARANTOR",
    fields: [field],
  };
  const emptyPublish = await fetch(`${base}/form-versions/${form.id}/publish`, {
    method: "POST",
    headers: headers(hr),
    body: JSON.stringify({ expectedRevision: 1 }),
  });
  assert.equal(emptyPublish.status, 400);
  const saved = await fetch(`${base}/form-versions/${form.id}`, {
    method: "PUT",
    headers: headers(hr),
    body: JSON.stringify({ expectedRevision: 1, content }),
  });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).revision, 2);
  const reopened = await fetch(`${base}/form-versions/${form.id}`, {
    headers: headers(hr),
  });
  assert.deepEqual((await reopened.json()).fields, [field]);
  const stale = await fetch(`${base}/form-versions/${form.id}`, {
    method: "PUT",
    headers: headers(hr),
    body: JSON.stringify({ expectedRevision: 1, content }),
  });
  assert.equal(stale.status, 409);
  const published = await fetch(`${base}/form-versions/${form.id}/publish`, {
    method: "POST",
    headers: headers(hr),
    body: JSON.stringify({ expectedRevision: 2 }),
  });
  assert.equal(published.status, 201);
  assert.equal((await published.json()).status, "PUBLISHED");
  const editPublished = await fetch(`${base}/form-versions/${form.id}`, {
    method: "PUT",
    headers: headers(hr),
    body: JSON.stringify({ expectedRevision: 3, content }),
  });
  assert.equal(editPublished.status, 409);
  assert.equal(
    (
      await fetch(`${base}/form-versions/${form.id}`, {
        headers: headers(employee),
      })
    ).status,
    403,
  );
  const versions = await Promise.all(
    [1, 2].map(() =>
      fetch(`${base}/forms/${form.formId}/versions`, {
        method: "POST",
        headers: headers(hr),
      }).then(async (r) => {
        assert.equal(r.status, 201);
        return r.json();
      }),
    ),
  );
  assert.equal(versions[0].id, versions[1].id);
  assert.equal(versions[0].version, 2);
  assert.equal(versions[0].status, "DRAFT");
  const original = await fetch(`${base}/form-versions/${form.id}`, {
    headers: headers(hr),
  });
  assert.equal((await original.json()).status, "PUBLISHED");
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const audit = await db.query(
      'SELECT action FROM "AuditEvent" WHERE "targetId"=$1',
      [form.id],
    );
    assert.deepEqual(
      audit.rows.map((r) => r.action).sort(),
      ["FORM_CREATED", "FORM_DRAFT_SAVED", "FORM_PUBLISHED"].sort(),
    );
    const outbox = await db.query(
      'SELECT type FROM "OutboxEvent" WHERE "targetId"=$1',
      [form.id],
    );
    assert.equal(outbox.rowCount, 3);
    await assert.rejects(
      db.query('UPDATE "FormVersion" SET title=$1 WHERE id=$2', [
        "Tampered",
        form.id,
      ]),
      /immutable/,
    );
    await assert.rejects(
      db.query('DELETE FROM "AuditEvent" WHERE "targetId"=$1', [form.id]),
      /permission denied/,
    );
  } finally {
    await db.end();
  }
});
