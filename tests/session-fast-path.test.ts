import test from "node:test";
import assert from "node:assert/strict";
import { Sessions } from "../apps/api/dist/sessions.js";
import { cookieName } from "../apps/api/dist/security.js";
import { seal } from "../apps/api/dist/auth-crypto.js";
import { SupabaseAuth } from "../apps/api/dist/supabase-auth.js";

test("concurrent reads validate provider without holding an exclusive session lock", async () => {
  const now = new Date();
  const user = { id: "11111111-1111-4111-8111-111111111111", active: true,
    authVersion: 1, name: "Test HR", email: "hr@example.invalid", role: "HR", permissions: [] };
  const session = { id:"22222222-2222-4222-8222-222222222222", userId:user.id,
    user, externalRequestId:null, revokedAt:null, expiresAt:new Date(now.getTime()+3600000),
    lastSeenAt:now, authVersion:1, authMethod:"SUPABASE", mfaVerified:true,
    providerSession:"mock-provider-session" };
  let locks = 0;
  const db = { session: { findUnique: async () => session,
    updateMany: async () => ({count:1}) },
    $transaction: async () => { locks++; throw Error("Unexpected exclusive session lock"); } };
  const provider = {
    canValidateWithoutSessionLock: () => true,
    providerTokensUnchanged: () => true,
    validate: async () => ({ user, encrypted:session.providerSession }),
  };
  const service = new Sessions(db as never, provider as never);
  const requests = Array.from({length:5},()=>({
    method:"GET", headers:{cookie:cookieName("session")+"="+"a".repeat(64)}
  }));
  await Promise.all(requests.map(req=>service.authenticate(req as never)));
  assert.equal(locks,0);
  assert(requests.every(req=>(req as any).actor.id===user.id));
});
test("a revoked session fails when the fast-path compare-and-swap loses the race", async () => {
  const user = { id: "11111111-1111-4111-8111-111111111111", active:true,
    authVersion:1, name:"Test HR", email:"hr@example.invalid", role:"HR", permissions:[] };
  const row = { id:"22222222-2222-4222-8222-222222222222", userId:user.id,
    user, externalRequestId:null, revokedAt:null, expiresAt:new Date(Date.now()+3600000),
    lastSeenAt:new Date(), authVersion:1, authMethod:"SUPABASE", mfaVerified:true,
    providerSession:"mock-provider-session" };
  let reads = 0;
  const db = {session:{
    // First read is the request snapshot; the re-read after the lost race shows the revocation.
    findUnique:async()=>(++reads===1?row:{...row,revokedAt:new Date()}),
    updateMany:async()=>({count:0})}};
  const provider = {canValidateWithoutSessionLock:()=>true,
    providerTokensUnchanged:()=>true,
    validate:async()=>({user,encrypted:row.providerSession})};
  const service=new Sessions(db as never,provider as never);
  const request={method:"GET",headers:{cookie:cookieName("session")+"="+"a".repeat(64)}};
  await assert.rejects(service.authenticate(request as never),/revoked/i);
  assert.equal((request as any).actor,undefined);
});

function slowPathFixture(validateDelayMs: number) {
  const user = { id: "11111111-1111-4111-8111-111111111111", active:true,
    authVersion:1, name:"Test HR", email:"hr@example.invalid", role:"HR", permissions:[] };
  const row:any = { id:"22222222-2222-4222-8222-222222222222", userId:user.id,
    user, externalRequestId:null, revokedAt:null, expiresAt:new Date(Date.now()+3600000),
    lastSeenAt:new Date(), authVersion:1, authMethod:"SUPABASE", mfaVerified:true,
    providerSession:"token-v0" };
  let version = 0, running = 0, maxRunning = 0, validations = 0, locks = 0;
  const db = {
    $transaction:async()=>{ locks++; throw Error("Slow path must not open a locking transaction"); },
    session:{
      findUnique:async()=>({...row}),
      updateMany:async({where,data}:any)=>{
        if (row.revokedAt || where.providerSession !== row.providerSession) return {count:0};
        row.providerSession = data.providerSession; return {count:1};
      },
    },
  };
  const provider = {
    canValidateWithoutSessionLock:()=>false, // token about to expire: forces the slow path
    providerTokensUnchanged:()=>false,
    validate:async()=>{
      running++; maxRunning=Math.max(maxRunning,running); validations++;
      await new Promise(r=>setTimeout(r,validateDelayMs));
      running--; return {user, encrypted:"token-v"+(++version)};
    },
  };
  return { row, db, provider, stats:()=>({maxRunning,validations,locks}) };
}
const slowRequest = () => ({method:"GET",headers:{cookie:cookieName("session")+"="+"a".repeat(64)}});

test("slow path never holds a database lock while contacting the provider", async () => {
  const f = slowPathFixture(5);
  const service = new Sessions(f.db as never, f.provider as never);
  const req = slowRequest();
  await service.authenticate(req as never);
  assert.equal(f.stats().locks, 0);
  assert.equal((req as any).actor.id, f.row.userId);
  assert.notEqual(f.row.providerSession, "token-v0"); // rotated tokens were saved
});

test("parallel slow-path requests for one session are queued, not run at once", async () => {
  const f = slowPathFixture(20);
  const service = new Sessions(f.db as never, f.provider as never);
  const requests = Array.from({length:6},slowRequest);
  await Promise.all(requests.map(r=>service.authenticate(r as never)));
  const { maxRunning, validations } = f.stats();
  assert.equal(maxRunning, 1, "refresh-token rotation must never run twice at once");
  assert.equal(validations, 6);
  assert(requests.every(r=>(r as any).actor.id===f.row.userId));
});

test("a session revoked while requests are queued rejects the queued request", async () => {
  const f = slowPathFixture(20);
  const service = new Sessions(f.db as never, f.provider as never);
  const first = slowRequest(), second = slowRequest();
  const p1 = service.authenticate(first as never);
  const p2 = service.authenticate(second as never);
  setTimeout(()=>{ f.row.revokedAt = new Date(); }, 10);
  await p1.catch(()=>undefined);
  await assert.rejects(p2, /revoked/i);
  assert.equal((second as any).actor, undefined);
});

test("fresh encrypted provider token envelope enables the fast path, expired tokens do not", () => {
  const originalKey=process.env.AUTH_ENCRYPTION_KEY;
  process.env.AUTH_ENCRYPTION_KEY=Buffer.alloc(32,42).toString("base64");
  try {
    const token=(exp:number)=>"header."+Buffer.from(JSON.stringify({exp})).toString("base64url")+".signature";
    const future=Math.floor(Date.now()/1000)+3600;
    const valid=seal({tokens:{access_token:token(future),refresh_token:"test-refresh"}});
    const duplicate=seal({tokens:{access_token:token(future),refresh_token:"test-refresh"}});
    const expired=seal({tokens:{access_token:token(Math.floor(Date.now()/1000)-10),refresh_token:"test-refresh"}});
    const service=new SupabaseAuth({} as never);
    assert.equal(service.canValidateWithoutSessionLock(valid),true);
    assert.equal(service.canValidateWithoutSessionLock(expired),false);
    assert.equal(service.providerTokensUnchanged(valid,duplicate),true);
    assert.equal(service.providerTokensUnchanged(valid,expired),false);
  } finally {
    if(originalKey===undefined) delete process.env.AUTH_ENCRYPTION_KEY;
    else process.env.AUTH_ENCRYPTION_KEY=originalKey;
  }
});
