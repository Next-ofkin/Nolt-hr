import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes, createHmac, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { Client } from "pg";
import { unseal } from "../../apps/api/src/auth-crypto.js";
export const base = "http://127.0.0.1:4000/api/v1";
export function requireLive() {
  assert.equal(process.env.AUTH_LIVE_TESTS, "true");
  assert.equal(process.env.SUPABASE_PROJECT_REF, "llslubzdkdnvhbatmfug");
  assert.notEqual(process.env.NODE_ENV, "production");
}
export function admin() {
  requireLive();
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
export async function owner() {
  requireLive();
  const db = new Client({
    connectionString: process.env.DIRECT_DATABASE_URL,
    options: "-c timezone=UTC",
  });
  await db.connect();
  return db;
}
export async function account(role = "EMPLOYEE", suppliedEmail?: string) {
  if (suppliedEmail && !/^qa-[0-9a-f-]{36}@example\.com$/.test(suppliedEmail))
    throw new Error("Only disposable QA email addresses may be supplied.");
  const provider = admin();
  const email = suppliedEmail ?? "qa-" + randomUUID() + "@example.com",
    password = randomBytes(24).toString("base64url") + "aA1!";
  const { data, error } = await provider.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name: "Automated QA",
      role: "HR",
      permissions: ["forms.manage"],
    },
  });
  if (error || !data.user)
    throw new Error(
      "Could not create isolated live Auth test account: " + error?.code,
    );
  const id = data.user.id;
  const db = await owner();
  try {
    const u = (
      await db.query('SELECT role FROM public."User" WHERE id=$1', [id])
    ).rows[0];
    assert.equal(
      u?.role,
      "EMPLOYEE",
      "User-editable metadata must not grant HR access",
    );
    if (role !== "EMPLOYEE")
      await db.query('UPDATE public."User" SET role=$1 WHERE id=$2', [
        role,
        id,
      ]);
  } finally {
    await db.end();
  }
  return {
    id,
    email,
    password,
    async cleanup() {
      const db = await owner();
      try {
        await db.query('UPDATE public."User" SET active=false WHERE id=$1', [
          id,
        ]);
        await db.query(
          'UPDATE public."Session" SET "revokedAt"=now() WHERE "userId"=$1',
          [id],
        );
      } finally {
        await db.end();
      }
      const r = await provider.auth.admin.deleteUser(id);
      if (r.error) throw new Error("Live Auth test account cleanup failed");
    },
  };
}
export function totp(secret: string) {
  let bits = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  for (const c of secret.replace(/=|\s/g, "").toUpperCase()) {
    const n = chars.indexOf(c);
    if (n < 0) throw new Error("Invalid TOTP secret");
    bits += n.toString(2).padStart(5, "0");
  }
  const key = Buffer.from(
    (bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return ((h.readUInt32BE(o) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
export class Browser {
  cookies = new Map<string, string>();
  async request(path: string, init: RequestInit = {}) {
    const r = await fetch(base + path, {
      ...init,
      headers: {
        Cookie: [...this.cookies].map(([k, v]) => k + "=" + v).join("; "),
        Origin: "http://127.0.0.1:3000",
        ...init.headers,
      },
    });
    for (const item of r.headers.getSetCookie()) {
      const pair = item.split(";")[0],
        i = pair.indexOf("=");
      if (pair.slice(i + 1))
        this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
      else this.cookies.delete(pair.slice(0, i));
    }
    return r;
  }
  post(path: string, body: unknown = {}, csrf?: string) {
    return this.request(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "x-csrf-token": csrf } : {}),
      },
      body: JSON.stringify(body),
    });
  }
  async login(user: { email: string; password: string }) {
    const r = await this.post("/auth/login", user);
    assert.equal(r.status, 201);
    assert.equal((await r.json()).next, "mfa");
    return this;
  }
  async enroll() {
    const flow = await (await this.request("/auth/flow")).json();
    assert.equal(flow.stage, "enroll");
    const r = await this.post("/auth/mfa/enroll", {}, flow.csrfToken);
    assert.equal(r.status, 201);
    return { ...(await r.json()), csrfToken: flow.csrfToken };
  }
  async verified(user: { email: string; password: string }) {
    await this.login({ email: user.email, password: user.password });
    const f = await this.enroll();
    const r = await this.post(
      "/auth/mfa/verify",
      { factorId: f.factorId, code: totp(f.secret) },
      f.csrfToken,
    );
    assert.equal(r.status, 201);
    assert.equal((await r.json()).next, "workspace");
    assert.match(r.headers.get("set-cookie") ?? "", /HttpOnly/i);
    return this;
  }
  async providerTokens() {
    const token = this.cookies.get("nolt_session")!;
    const db = await owner();
    try {
      const row = (
        await db.query(
          'SELECT "providerSession" FROM public."Session" WHERE "tokenHash"=$1',
          [createHash("sha256").update(token).digest("hex")],
        )
      ).rows[0];
      assert.ok(row.providerSession.startsWith("v1."));
      return unseal<{
        tokens: { access_token: string; refresh_token: string };
      }>(row.providerSession).tokens;
    } finally {
      await db.end();
    }
  }
}
