import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { account, admin, Browser, owner, totp } from "./support/real-auth.js";
import { createField } from "@nolt/form-schemas";
import { Database } from "../apps/api/src/database.js";
import { SupabaseAuth } from "../apps/api/src/supabase-auth.js";
import { Sessions } from "../apps/api/src/sessions.js";
import type { AuthRequest } from "../apps/api/src/auth.js";

test("real Supabase password login requires TOTP and ignores signup role metadata", async () => {
  const user = await account();
  try {
    const b = new Browser();
    assert.equal(
      (await b.post("/auth/local-session", { role: "HR" })).status,
      404,
    );
    assert.equal(
      (
        await b.post("/auth/signup", {
          email: user.email,
          password: user.password,
          name: "QA",
          role: "HR",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await b.post("/auth/login", {
          email: user.email,
          password: "incorrect-password",
        })
      ).status,
      401,
    );
    await b.login({ email: user.email, password: user.password });
    assert.equal((await b.request("/auth/session")).status, 401);
    assert.ok(!b.cookies.has("nolt_session"));
    const f = await b.enroll();
    assert.ok(f.qrCode.startsWith("data:image/"));
    assert.equal(
      (
        await b.post("/auth/mfa/verify", {
          factorId: f.factorId,
          code: totp(f.secret),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await b.post(
          "/auth/mfa/verify",
          { factorId: randomUUID(), code: totp(f.secret) },
          f.csrfToken,
        )
      ).status,
      403,
    );
    const valid = totp(f.secret);
    const wrong = valid === "000000" ? "111111" : "000000";
    assert.equal(
      (
        await b.post(
          "/auth/mfa/verify",
          { factorId: f.factorId, code: wrong },
          f.csrfToken,
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await b.post(
          "/auth/mfa/verify",
          { factorId: f.factorId, code: totp(f.secret) },
          f.csrfToken,
        )
      ).status,
      201,
    );
    const r = await b.request("/auth/session");
    assert.equal(r.status, 200);
    const s = await r.json();
    assert.equal(s.authMethod, "SUPABASE");
    assert.equal(s.mfaVerified, true);
    assert.equal(s.role, "EMPLOYEE");
    // Real session + deliberately unavailable transport: fail closed without retiring the session.
    const database = new Database(),
      provider = new SupabaseAuth(database),
      originalFetch = globalThis.fetch;
    const token = b.cookies.get("nolt_session")!;
    const before = await database.session.findUniqueOrThrow({
      where: { tokenHash: createHash("sha256").update(token).digest("hex") },
    });
    const request = {
      method: "GET",
      headers: { cookie: "nolt_session=" + token },
    } as AuthRequest;
    try {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            code: "unexpected_failure",
            msg: "QA transport unavailable",
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        );
      await assert.rejects(
        new Sessions(database, provider).authenticate(request),
        (e: unknown) =>
          !!e &&
          typeof e === "object" &&
          "getStatus" in e &&
          (e as { getStatus: () => number }).getStatus() === 503,
      );
      assert.equal(request.actor, undefined);
      const after = await database.session.findUniqueOrThrow({
        where: { id: before.id },
      });
      assert.equal(after.lastSeenAt.getTime(), before.lastSeenAt.getTime());
      assert.equal(after.providerSession, before.providerSession);
    } finally {
      globalThis.fetch = originalFetch;
      await database.$disconnect();
    }
    assert.equal((await b.request("/auth/session")).status, 200);
    assert.equal((await b.request("/forms")).status, 403);
    assert.equal((await b.post("/auth/logout")).status, 403);
    assert.equal((await b.post("/auth/logout", {}, s.csrfToken)).status, 201);
    assert.equal((await b.request("/auth/session")).status, 401);
  } finally {
    await user.cleanup();
  }
});
test("real MFA HR session preserves form versions, stale writes, audit and concurrent allocation", async () => {
  const user = await account("HR");
  try {
    const b = await new Browser().verified(user);
    const session = await (await b.request("/auth/session")).json();
    const csrf = session.csrfToken;
    const created = await b.post(
      "/forms",
      { title: "Live Auth QA " + Date.now(), recipient: "GUARANTOR" },
      csrf,
    );
    assert.equal(created.status, 201);
    const form = await created.json();
    const field = createField("signature", randomUUID());
    field.label = "Signature";
    const content = {
      title: form.title,
      description: "Live provider integration test",
      recipient: "GUARANTOR",
      fields: [field],
    };
    const save = (revision: number) =>
      b.request("/form-versions/" + form.id, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ expectedRevision: revision, content }),
      });
    assert.equal((await save(1)).status, 200);
    assert.equal((await save(1)).status, 409);
    assert.equal(
      (
        await b.post(
          "/form-versions/" + form.id + "/publish",
          { expectedRevision: 2 },
          csrf,
        )
      ).status,
      201,
    );
    assert.equal((await save(3)).status, 409);
    const versions = await Promise.all(
      [1, 2].map(async () => {
        const r = await b.post("/forms/" + form.formId + "/versions", {}, csrf);
        assert.equal(r.status, 201);
        return r.json();
      }),
    );
    assert.equal(versions[0].id, versions[1].id);
    const db = await owner();
    try {
      const audit = (
        await db.query(
          'SELECT action FROM public."AuditEvent" WHERE "targetId"=$1',
          [form.id],
        )
      ).rows;
      assert.deepEqual(
        audit.map((r) => r.action).sort(),
        ["FORM_CREATED", "FORM_DRAFT_SAVED", "FORM_PUBLISHED"].sort(),
      );
      await db.query('UPDATE public."User" SET role=$1 WHERE id=$2', [
        "DEVELOPER",
        user.id,
      ]);
    } finally {
      await db.end();
    }
    assert.equal((await b.request("/auth/session")).status, 401);
  } finally {
    await user.cleanup();
  }
});
test("provider-side global revocation immediately blocks an otherwise unexpired application session", async () => {
  const user = await account();
  try {
    const b = await new Browser().verified(user);
    assert.equal((await b.request("/auth/session")).status, 200);
    const tokens = await b.providerTokens();
    const r = await admin().auth.admin.signOut(tokens.access_token, "global");
    assert.equal(r.error, null);
    assert.equal((await b.request("/auth/session")).status, 401);
  } finally {
    await user.cleanup();
  }
});
test("real Auth sessions enforce idle expiry", async () => {
  const user = await account();
  try {
    const b = await new Browser().verified(user);
    const db = await owner();
    try {
      await db.query(
        'UPDATE public."Session" SET "lastSeenAt"=now()-interval \'31 minutes\' WHERE "userId"=$1',
        [user.id],
      );
    } finally {
      await db.end();
    }
    assert.equal((await b.request("/auth/session")).status, 401);
  } finally {
    await user.cleanup();
  }
});
