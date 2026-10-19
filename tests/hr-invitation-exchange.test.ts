import assert from "node:assert/strict";
import test from "node:test";
import { HrInvitationExchangeService } from "../apps/api/src/hr-invitation-exchange.js";

test("HR recipient exchange is fail-closed before DB or Supabase access", async () => {
  const old = process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
  delete process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
  try {
    const unavailable = new Proxy({}, { get() { throw Error("Unexpected external dependency access"); } });
    const service = new HrInvitationExchangeService(unavailable as never, unavailable as never, unavailable as never);
    await assert.rejects(service.exchange({}), (e: unknown) =>
      Boolean(e && typeof e === "object" && "status" in e && e.status === 503));
  } finally {
    if (old === undefined) delete process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
    else process.env.HR_INVITATION_ACCEPTANCE_ENABLED = old;
  }
});

test("matching HR recipient starts only the dedicated MFA flow", async () => {
  const old = process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
  process.env.HR_INVITATION_ACCEPTANCE_ENABLED = "true";
  const id = "e4b703d5-bf2c-4555-bfb1-6e63d452af3a";
  const subject = "cbfab129-8d44-4ed3-82a2-d026b09fe902";
  const email = "new-hr@example.invalid";
  const record: { started?: unknown[] } = {};
  const db = {
    hrInvitation: { findUnique: async () => ({
      id, email, state: "SENT", expiresAt: new Date(Date.now() + 180_000),
      revokedAt: null, creationSubject: subject, providerSubject: subject,
    }) },
    user: { findUnique: async () => ({ id: subject, role: "EMPLOYEE", active: true }) },
    employee: { findFirst: async () => null },
  };
  const auth = {
    authenticated: async () => ({
      session: { access_token: "access", refresh_token: "refresh" },
      user: { id: subject, email, email_confirmed_at: new Date().toISOString() },
    }),
    tokens: (v: unknown) => v,
    start: async (...args: unknown[]) => { record.started = args; return { next: "mfa" }; },
  };
  try {
    const service = new HrInvitationExchangeService(db as never, auth as never, {} as never);
    const result = await service.exchange(
      { invitationId: id, proof: { access_token: "access", refresh_token: "refresh" } },
      { headers: {} } as never, {} as never,
    );
    assert.deepEqual(result, { next: "mfa" });
    assert.ok(record.started);
    assert.equal(record.started[0], "HR_INVITATION");
    assert.deepEqual((record.started[1] as { invitationId: string }).invitationId, id);
    assert.ok((record.started[4] as number) > 0);
    assert.ok((record.started[4] as number) <= 180_000);
  } finally {
    if (old === undefined) delete process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
    else process.env.HR_INVITATION_ACCEPTANCE_ENABLED = old;
  }
});

test("HR completion verification refuses access without touching any backend when disabled", async () => {
  const prior = process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
  delete process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
  try {
    const forbidden = new Proxy({}, { get() { throw Error("Unexpected database/provider access"); } });
    const service = new HrInvitationExchangeService(forbidden as never, forbidden as never, forbidden as never);
    await assert.rejects(service.verification({} as never), (e: unknown) =>
      Boolean(e && typeof e === "object" && "status" in e && e.status === 503));
  } finally {
    if (prior === undefined) delete process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
    else process.env.HR_INVITATION_ACCEPTANCE_ENABLED = prior;
  }
});

test("HR verification requires its own flow and never invokes activation", async () => {
  const prior = process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
  process.env.HR_INVITATION_ACCEPTANCE_ENABLED = "true";
  const invitationId = "e4b703d5-bf2c-4555-bfb1-6e63d452af3a";
  const calls: string[] = [];
  const auth = { flow: async () => ({
    row: { kind: "HR_INVITATION" },
    state: { invitationId, tokens: { access_token: "test", refresh_token: "test" } },
  }) };
  const db = { hrInvitation: { findUnique: async () => {
    calls.push("read invitation");
    return { id: invitationId };
  } } };
  const proof = { verify: async () => {
    calls.push("verify provider MFA");
    return { activationAllowed: false };
  } };
  try {
    const service = new HrInvitationExchangeService(db as never, auth as never, proof as never);
    assert.deepEqual(await service.verification({} as never), {
      verified: true, activationAllowed: false, resuming: false,
    });
    assert.deepEqual(calls, ["read invitation", "verify provider MFA"]);
  } finally {
    if (prior === undefined) delete process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
    else process.env.HR_INVITATION_ACCEPTANCE_ENABLED = prior;
  }
});

test("HR password setup fails closed without checking DB or provider", async () => {
  const prior = process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
  delete process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
  try {
    const inaccessible = new Proxy({}, { get() { throw Error("Must not access backend"); } });
    const service = new HrInvitationExchangeService(inaccessible as never, inaccessible as never, inaccessible as never);
    await assert.rejects(service.setPassword({ password: "verylongpassword123" }, {} as never), (e: unknown) =>
      Boolean(e && typeof e === "object" && "status" in e && e.status === 503));
  } finally {
    if (prior === undefined) delete process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
    else process.env.HR_INVITATION_ACCEPTANCE_ENABLED = prior;
  }
});

test("HR password setup refuses already completed flow before contacting provider", async () => {
  const prior = process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
  process.env.HR_INVITATION_ACCEPTANCE_ENABLED = "true";
  try {
    const inaccessible = new Proxy({}, { get() { throw Error("Must not access backend"); } });
    const auth = { flow: async () => ({
      row: { kind: "HR_INVITATION" },
      state: { invitationId: "e4b703d5-bf2c-4555-bfb1-6e63d452af3a", tokens: { access_token: "a", refresh_token: "b" }, hrPasswordSet: true },
    }) };
    const service = new HrInvitationExchangeService(inaccessible as never, auth as never, inaccessible as never);
    await assert.rejects(service.setPassword({ password: "verylongpassword123" }, {} as never), (e: unknown) =>
      Boolean(e && typeof e === "object" && "status" in e && e.status === 403));
  } finally {
    if (prior === undefined) delete process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
    else process.env.HR_INVITATION_ACCEPTANCE_ENABLED = prior;
  }
});

test("competing HR password requests claim one flow before touching Supabase", async () => {
  const prior = process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
  const oldKey = process.env.AUTH_ENCRYPTION_KEY;
  process.env.AUTH_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.HR_INVITATION_ACCEPTANCE_ENABLED = "true";
  const id = "e4b703d5-bf2c-4555-bfb1-6e63d452af3a";
  const subject = "cbfab129-8d44-4ed3-82a2-d026b09fe902";
  const state = { invitationId: id, tokens: { access_token: "a", refresh_token: "b" } };
  let claims = 0, updates = 0;
  let confirmation: unknown;
  const db = {
    hrInvitation: { findUnique: async () => ({ id }) },
    authFlow: { updateMany: async (params: unknown) => { claims++; if (claims === 2) confirmation = params; return { count: claims <= 2 ? 1 : 0 }; } },
  };
  const client = { auth: {
    updateUser: async () => { updates++; return { error: null }; },
    getSession: async () => ({ data: { session: { access_token: "post-password-aal2", refresh_token: "refreshed" } } }),
  } };
  const auth = {
    flow: async () => ({ row: { id, kind: "HR_INVITATION", encryptedState: "old" }, state }),
    authenticated: async () => ({ user: { id: subject }, client }),
    tokens: (session: unknown) => session,
  };
  const proof = { verify: async () => ({ subject }) };
  const service = new HrInvitationExchangeService(db as never, auth as never, proof as never);
  try {
    const request = { password: "safe-test-password-123" };
    const a = await service.setPassword(request, {} as never);
    assert.deepEqual(a, { next: "awaiting_activation" });
    await assert.rejects(service.setPassword(request, {} as never), (e: unknown) =>
      Boolean(e && typeof e === "object" && "status" in e && e.status === 403));
    assert.equal(claims, 3);
    assert.equal(updates, 1);
    const { unseal } = await import("../apps/api/src/auth-crypto.js");
    const confirmed = unseal<{ tokens: { access_token: string }; hrPasswordStatus: string }>((confirmation as { data: { encryptedState: string } }).data.encryptedState);
    assert.equal(confirmed.tokens.access_token, "post-password-aal2");
    assert.equal(confirmed.hrPasswordStatus, "CONFIRMED");
  } finally {
    if (oldKey === undefined) delete process.env.AUTH_ENCRYPTION_KEY;
    else process.env.AUTH_ENCRYPTION_KEY = oldKey;
    if (prior === undefined) delete process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
    else process.env.HR_INVITATION_ACCEPTANCE_ENABLED = prior;
  }
});

test("failed HR password update leaves claim unconfirmed and never activates", async () => {
  const prior = process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
  const key = process.env.AUTH_ENCRYPTION_KEY;
  process.env.HR_INVITATION_ACCEPTANCE_ENABLED = "true";
  process.env.AUTH_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
  const id = "e4b703d5-bf2c-4555-bfb1-6e63d452af3a";
  let writes = 0;
  const auth = {
    flow: async () => ({ row: { id, kind: "HR_INVITATION", encryptedState: "initial" },
      state: { invitationId: id, tokens: { access_token: "a", refresh_token: "b" } } }),
    authenticated: async () => ({ user: { id }, client: { auth: { updateUser: async () => ({ error: new Error("provider rejected") }) } } }),
  };
  const db = {
    hrInvitation: { findUnique: async () => ({ id }) },
    authFlow: { updateMany: async () => { writes++; return { count: 1 }; } },
  };
  const proof = { verify: async () => ({ subject: id }) };
  try {
    const service = new HrInvitationExchangeService(db as never, auth as never, proof as never);
    await assert.rejects(service.setPassword({ password: "safe-test-password-123" }, {} as never),
      (e: unknown) => Boolean(e && typeof e === "object" && "status" in e && e.status === 400));
    assert.equal(writes, 1);
  } finally {
    if (prior === undefined) delete process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
    else process.env.HR_INVITATION_ACCEPTANCE_ENABLED = prior;
    if (key === undefined) delete process.env.AUTH_ENCRYPTION_KEY;
    else process.env.AUTH_ENCRYPTION_KEY = key;
  }
});

test("activation readiness stays unavailable before any dependency access when disabled", async () => {
  const previous = process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
  delete process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
  try {
    const forbidden = new Proxy({}, { get() { throw Error("External access forbidden"); } });
    const service = new HrInvitationExchangeService(forbidden as never, forbidden as never, forbidden as never);
    await assert.rejects(service.activationReadiness({} as never), (e: unknown) =>
      Boolean(e && typeof e === "object" && "status" in e && e.status === 503));
  } finally {
    if (previous === undefined) delete process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
    else process.env.HR_INVITATION_ACCEPTANCE_ENABLED = previous;
  }
});

test("activation readiness refuses an unconfirmed flow before provider verification", async () => {
  const previous = process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
  process.env.HR_INVITATION_ACCEPTANCE_ENABLED = "true";
  const forbidden = new Proxy({}, { get() { throw Error("External access forbidden"); } });
  const auth = { flow: async () => ({
    row: { kind: "HR_INVITATION", hrPasswordConfirmedAt: null },
    state: { invitationId: "e4b703d5-bf2c-4555-bfb1-6e63d452af3a", hrSubject: "cbfab129-8d44-4ed3-82a2-d026b09fe902", tokens: { access_token: "a", refresh_token: "b" }, hrPasswordStatus: "CLAIMED" },
  }) };
  try {
    const service = new HrInvitationExchangeService(forbidden as never, auth as never, forbidden as never);
    await assert.rejects(service.activationReadiness({} as never), (e: unknown) =>
      Boolean(e && typeof e === "object" && "status" in e && e.status === 403));
  } finally {
    if (previous === undefined) delete process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
    else process.env.HR_INVITATION_ACCEPTANCE_ENABLED = previous;
  }
});

test("activation readiness reports prerequisites only and never grants access", async () => {
  const previous = process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
  process.env.HR_INVITATION_ACCEPTANCE_ENABLED = "true";
  const invitationId = "e4b703d5-bf2c-4555-bfb1-6e63d452af3a";
  const subject = "cbfab129-8d44-4ed3-82a2-d026b09fe902";
  const email = "hr-test@example.invalid";
  const now = Date.now();
  const verifiedAt = new Date(now - 30_000);
  const row = {
    kind: "HR_INVITATION", hrInvitationId: invitationId, hrSubject: subject,
    createdAt: new Date(now - 60_000), expiresAt: new Date(now + 60_000),
    hrPasswordConfirmedAt: verifiedAt,
  };
  const state = { invitationId, hrSubject: subject, hrPasswordStatus: "CONFIRMED",
    tokens: { access_token: "a", refresh_token: "b" } };
  const db = { hrInvitation: { findUnique: async () => ({ id: invitationId, email }) } };
  const auth = { flow: async () => ({ row, state }) };
  let checked = 0;
  const proof = { verify: async () => { checked++; return { subject, email }; } };
  try {
    const service = new HrInvitationExchangeService(db as never, auth as never, proof as never);
    assert.deepEqual(await service.activationReadiness({} as never),
      { prerequisitesMet: true, activationAllowed: false });
    assert.equal(checked, 1);
  } finally {
    if (previous === undefined) delete process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
    else process.env.HR_INVITATION_ACCEPTANCE_ENABLED = previous;
  }
});

test("HR MFA storage uses compare-and-swap instead of unconditional updates", async () => {
  const { SupabaseAuth } = await import("../apps/api/src/supabase-auth.js");
  const old = process.env.AUTH_ENCRYPTION_KEY;
  process.env.AUTH_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  const row = { id: "e4b703d5-bf2c-4555-bfb1-6e63d452af3a", kind: "HR_INVITATION", encryptedState: "snapshot" };
  let observed: unknown;
  const db = { authFlow: {
    updateMany: async (value: unknown) => { observed = value; return { count: 0 }; },
    update: async () => { throw Error("An HR flow must not be overwritten unconditionally"); },
  } };
  try {
    const auth = new SupabaseAuth(db as never);
    await assert.rejects(
      (auth as unknown as { replaceHrFlowSnapshot: (row: unknown, value: unknown) => Promise<void> })
        .replaceHrFlowSnapshot(row, { invitationId: row.id }),
      (error: unknown) => Boolean(error && typeof error === "object" && "status" in error && error.status === 403),
    );
    assert.ok(observed);
    const query = observed as { where: { encryptedState: string; kind: string; hrPasswordConfirmedAt: null } };
    assert.equal(query.where.encryptedState, "snapshot");
    assert.equal(query.where.kind, "HR_INVITATION");
    assert.equal(query.where.hrPasswordConfirmedAt, null);
  } finally {
    if (old === undefined) delete process.env.AUTH_ENCRYPTION_KEY;
    else process.env.AUTH_ENCRYPTION_KEY = old;
  }
});

test("HR proof requires the expected Supabase identity issuer", async () => {
  const { HrInvitationProofService } = await import("../apps/api/src/hr-invitation-proof.js");
  const before = process.env.SUPABASE_URL;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  const subject = "cbfab129-8d44-4ed3-82a2-d026b09fe902";
  const email = "new-hr@example.invalid";
  let issuerChecked = "";
  const db = {
    $queryRaw: async () => [{ active: true }],
    user: { findUnique: async () => ({ id: subject, role: "EMPLOYEE", active: true }) },
    employee: { findUnique: async () => null },
    identity: { findFirst: async (query: { where: { issuer: string } }) => {
      issuerChecked = query.where.issuer;
      return null;
    } },
  };
  const auth = { authenticated: async () => ({
    user: { id: subject, email, email_confirmed_at: new Date().toISOString(), factors: [{ factor_type: "totp", status: "verified" }] },
    session: { access_token: "synthetic" },
    client: { auth: { getClaims: async () => ({ data: { claims: { sub: subject, aal: "aal2", session_id: "e4b703d5-bf2c-4555-bfb1-6e63d452af3a" } } }) } },
  }) };
  try {
    const service = new HrInvitationProofService(auth as never, db as never);
    await assert.rejects(service.verify({
      state: "SENT", email, expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null, creationSubject: subject, providerSubject: subject,
    }, { access_token: "a", refresh_token: "b" }), (error: unknown) =>
      Boolean(error && typeof error === "object" && "status" in error && error.status === 403));
    assert.equal(issuerChecked, "https://example.supabase.co/auth/v1");
  } finally {
    if (before === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = before;
  }
});

test("HR resume and confirmation are disabled without provider or database calls", async () => {
  const previous = process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
  delete process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
  try {
    const inaccessible = new Proxy({}, { get() { throw Error("No external access allowed"); } });
    const service = new HrInvitationExchangeService(inaccessible as never, inaccessible as never, inaccessible as never);
    for (const request of [service.resume({}, {} as never, {} as never), service.confirmResume({} as never)])
      await assert.rejects(request, (e:unknown)=>Boolean(e&&typeof e==="object"&&"status" in e&&e.status===503));
  } finally {
    if(previous===undefined) delete process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
    else process.env.HR_INVITATION_ACCEPTANCE_ENABLED=previous;
  }
});

test("HR resume denies an account without original password confirmation before Supabase login",async()=>{
  const previous=process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
  process.env.HR_INVITATION_ACCEPTANCE_ENABLED="true";
  const db={
    hrInvitation:{findFirst:async()=>({id:"e4b703d5-bf2c-4555-bfb1-6e63d452af3a",email:"test@example.invalid",state:"SENT",creationSubject:"cbfab129-8d44-4ed3-82a2-d026b09fe902",providerSubject:"cbfab129-8d44-4ed3-82a2-d026b09fe902",expiresAt:new Date(Date.now()+60000)})},
    authFlow:{findFirst:async()=>null},
  };
  const forbidden=new Proxy({},{get(){throw Error("Must not touch Supabase")}});
  try {
    const service=new HrInvitationExchangeService(db as never,forbidden as never,forbidden as never);
    await assert.rejects(service.resume({email:"test@example.invalid",password:"existing-password"},{} as never,{} as never),
      (e:unknown)=>Boolean(e&&typeof e==="object"&&"status" in e&&e.status===403));
  } finally {
    if(previous===undefined) delete process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
    else process.env.HR_INVITATION_ACCEPTANCE_ENABLED=previous;
  }
});

test("resume confirmation cannot run on an ordinary HR invitation flow",async()=>{
  const previous=process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
  process.env.HR_INVITATION_ACCEPTANCE_ENABLED="true";
  const auth={flow:async()=>({row:{kind:"HR_INVITATION"},state:{invitationId:"e4b703d5-bf2c-4555-bfb1-6e63d452af3a"}})};
  const forbidden=new Proxy({},{get(){throw Error("No writes or calls allowed")}});
  try {
    const service=new HrInvitationExchangeService(forbidden as never,auth as never,forbidden as never);
    await assert.rejects(service.confirmResume({} as never),
      (e:unknown)=>Boolean(e&&typeof e==="object"&&"status" in e&&e.status===403));
  } finally {
    if(previous===undefined) delete process.env.HR_INVITATION_ACCEPTANCE_ENABLED;
    else process.env.HR_INVITATION_ACCEPTANCE_ENABLED=previous;
  }
});
