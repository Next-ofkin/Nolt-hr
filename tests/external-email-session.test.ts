import test from "node:test";
import assert from "node:assert/strict";
import { ExternalSessions } from "../apps/api/dist/external-sessions.js";
import { externalInvitation } from "../apps/api/dist/external-email.js";
import { digest } from "../apps/api/dist/security.js";
import { ExternalRequestsService } from "../apps/api/dist/external-requests.js";
import { Sessions } from "../apps/api/dist/sessions.js";

test("global application logout also revokes this user's external form sessions", async () => {
  const previous = process.env.PUBLIC_APP_URL;
  process.env.PUBLIC_APP_URL = "https://portal.example.invalid";
  const revoked: unknown[] = [];
  const db = {
    session: { findUnique: async () => null },
    $transaction: async (fn: any) =>
      fn({
        session: { updateMany: async () => ({ count: 1 }) },
        externalEmailSession: {
          updateMany: async (query: unknown) => {
            revoked.push(query);
            return { count: 1 };
          },
        },
        outboxEvent: { create: async () => {} },
        auditEvent: { create: async () => {} },
      }),
  };
  const cleared: string[] = [];
  try {
    await new Sessions(db as never, {} as never).revoke(
      { actor: { id: "recipient" }, sessionId: "staff-session" } as never,
      { clearCookie: (name: string) => cleared.push(name) } as never,
      true,
    );
    assert.deepEqual((revoked[0] as any).where, {
      userId: "recipient",
      revokedAt: null,
    });
    assert.ok(cleared.some((name) => name.endsWith("nolt_external")));
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = previous;
  }
});

test("external sender generates proof without staff email and sends only the simple Resend message", async () => {
  const previousFetch = globalThis.fetch;
  const keys = [
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "PUBLIC_APP_URL",
    "LOCAL_DEVELOPMENT",
    "NODE_ENV",
  ];
  const previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  Object.assign(process.env, {
    SUPABASE_URL: "https://provider.example.invalid",
    SUPABASE_SECRET_KEY: "unit-only-provider-key",
    RESEND_API_KEY: "unit-only-sender-key",
    RESEND_FROM_EMAIL: "HR <hr@example.invalid>",
    PUBLIC_APP_URL: "https://portal.example.invalid",
    LOCAL_DEVELOPMENT: "false",
    NODE_ENV: "test",
  });
  let mails = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (
      url === "https://provider.example.invalid/auth/v1/admin/generate_link"
    ) {
      assert.equal(JSON.parse(String(init?.body)).type, "magiclink");
      return new Response(
        JSON.stringify({
          id: "recipient",
          email: "recipient@example.invalid",
          hashed_token: "proof-for-unit-fixture",
          verification_type: "signup",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    assert.equal(
      url,
      "https://api.resend.com/emails",
      "No Supabase invite/OTP email endpoint may be called",
    );
    mails++;
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.to, ["recipient@example.invalid"]);
    assert.match(body.text, /#token_hash=proof-for-unit-fixture&type=signup/);
    assert.doesNotMatch(
      body.text.replace(/https:\S+/g, ""),
      /password|MFA|authenticator|sign.up/i,
    );
    return new Response(JSON.stringify({ id: "email-fixture" }), {
      status: 200,
    });
  };
  try {
    const service = new ExternalRequestsService(
      {
        externalRequest: {
          findUniqueOrThrow: async () => ({
            expiresAt: new Date(Date.now() + 60000),
            assignment: { formVersion: { title: "Guarantor form" } },
          }),
        },
      } as never,
      {} as never,
      {} as never,
    );
    assert.equal(
      await service.sendEmail("recipient@example.invalid", "request-fixture"),
      null,
    );
    assert.equal(mails, 1);
  } finally {
    globalThis.fetch = previousFetch;
    for (const k of keys)
      if (previous[k] === undefined) delete process.env[k];
      else process.env[k] = previous[k];
  }
});

test("external email sessions use a dedicated cookie and require matching recipient, expiry and CSRF", async () => {
  const token = "a".repeat(64);
  let row: any = {
    id: "session",
    userId: "recipient",
    authVersion: 1,
    expiresAt: new Date(Date.now() + 60000),
    revokedAt: null,
    user: {
      id: "recipient",
      email: "recipient@example.invalid",
      active: true,
      authVersion: 1,
    },
    request: {
      id: "request",
      respondentId: "recipient",
      createdBy: "employee",
      email: "recipient@example.invalid",
      state: "ACTIVE",
      expiresAt: new Date(Date.now() + 60000),
      revokedAt: null,
    },
  };
  const service = new ExternalSessions({
    externalEmailSession: { findUnique: async () => row },
  } as never);
  const req = (headers = {}, method = "GET") =>
    ({
      method,
      headers: { cookie: "nolt_external=" + token, ...headers },
    }) as any;
  const r = req();
  const s = await service.authenticate(r);
  assert.equal(s.csrfToken, digest("external-csrf:" + token));
  assert.equal(r.actor.mfaVerified, false);
  assert.deepEqual(r.actor.permissions, []);
  assert.equal(r.externalRequestId, "request");
  await assert.rejects(
    service.authenticate({
      method: "GET",
      headers: { cookie: "nolt_session=" + token },
    } as any),
    (e: any) => e.getStatus() === 401,
  );
  await assert.rejects(
    service.authenticate(req({}, "PUT")),
    (e: any) => e.getStatus() === 403,
  );
  await service.authenticate(req({ "x-csrf-token": s.csrfToken }, "PUT"));
  row.request.respondentId = "other";
  await assert.rejects(
    service.authenticate(req()),
    (e: any) => e.getStatus() === 403,
  );
  row.request.respondentId = "recipient";
  row.request.state = "REVOKED";
  await assert.rejects(
    service.authenticate(req()),
    (e: any) => e.getStatus() === 403,
  );
  row.request.state = "ACTIVE";
  row.expiresAt = new Date(0);
  await assert.rejects(
    service.authenticate(req()),
    (e: any) => e.getStatus() === 401,
  );
});

test("simple external invitation escapes authored titles and contains no staff setup instructions", () => {
  const message = externalInvitation(
    '<img src=x onerror="attack()">',
    "https://example.invalid/external/accept#token_hash=private",
    new Date("2026-10-15T18:00:00.000Z"),
  );
  assert.match(message.html, /&lt;img/);
  assert.doesNotMatch(message.html, /<img/);
  assert.match(message.html, />Open form</);
  assert.doesNotMatch(message.text, /password|authenticator|sign.up|MFA/i);
});
