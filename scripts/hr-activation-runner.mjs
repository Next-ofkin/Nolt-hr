// Offline, explicitly gated HR activation. NOT imported into NestJS / public API.
// Dry-run always; --apply additionally requires a dedicated gate and typed confirmation.
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { createDecipheriv } from "node:crypto";
import { config } from "dotenv";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { hrActivationPreflight, validateOfflineActivationEnvironment } from "./hr-activation-preflight.mjs";

export function decodeHrFlow(value, keyBase64) {
  const key = Buffer.from(keyBase64 ?? "", "base64");
  const [version, iv, tag, ciphertext] = value?.split(".") ?? [];
  if (key.length !== 32 || version !== "v1" || !iv || !tag || !ciphertext)
    throw new Error("Invalid encrypted HR flow or operator encryption key.");
  const cipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv,"base64url"));
  cipher.setAuthTag(Buffer.from(tag,"base64url"));
  return JSON.parse(Buffer.concat([
    cipher.update(Buffer.from(ciphertext,"base64url")), cipher.final(),
  ]).toString("utf8"));
}

export function validateRunnerEnvironment(env, args, apply) {
  validateOfflineActivationEnvironment(env, args, true);
  if (!env.SUPABASE_URL || new URL(env.SUPABASE_URL).hostname !== "llslubzdkdnvhbatmfug.supabase.co")
    throw new Error("Supabase project URL does not match the approved project.");
  if (!env.SUPABASE_PUBLISHABLE_KEY || !env.AUTH_ENCRYPTION_KEY)
    throw new Error("Supabase publishable key and flow encryption key are required.");
  if (apply && env.HR_ACTIVATION_RUNNER_ENABLED !== "true")
    throw new Error("Privileged HR activation runner is disabled.");
  return args;
}

// Auth service must check real getUser, authenticated aal2 claims, verified TOTP
// and current provider session. Never treat the invitation itself as MFA proof.
export async function verifyLiveHrProvider(auth, db, invitationId, subjectId, flowId, flowState) {
  if (flowState.invitationId !== invitationId || flowState.hrSubject !== subjectId ||
      flowState.hrPasswordStatus !== "CONFIRMED" || !flowState.tokens?.access_token)
    throw new Error("HR password verification or subject binding is incomplete.");
  const accessToken = flowState.tokens.access_token;
  const [userResult, claimsResult] = await Promise.all([
    auth.auth.getUser(accessToken),
    auth.auth.getClaims(accessToken),
  ]);
  const user = userResult.data?.user, claims = claimsResult.data?.claims;
  if (userResult.error || claimsResult.error || !user || !claims ||
      user.id !== subjectId || claims.sub !== subjectId || claims.aal !== "aal2" ||
      !user.email_confirmed_at ||
      !user.factors?.some((factor) => factor.factor_type === "totp" && factor.status === "verified") ||
      !/^[0-9a-f-]{36}$/i.test(claims.session_id ?? ""))
    throw new Error("Fresh verified Supabase identity and TOTP AAL2 session are required.");
  const session = await db.query(
    "SELECT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=$1::uuid AND s.user_id=$2::uuid AND s.not_after IS DISTINCT FROM '-infinity'::timestamptz AND (s.not_after IS NULL OR s.not_after > now())) AS active",
    [claims.session_id, subjectId],
  );
  if (session.rows[0]?.active !== true)
    throw new Error("Supabase provider session is no longer active.");
  const bound = await db.query(
    'SELECT h.email FROM public."HrInvitation" h WHERE h.id=$1::uuid AND h."providerSubject"=$2::uuid AND h."creationSubject"=$2::uuid',
    [invitationId, subjectId],
  );
  if (bound.rows[0]?.email !== user.email?.trim().toLowerCase())
    throw new Error("Confirmed Supabase email does not match the invitation.");
  return { subject: subjectId, invitationId, flowId, sessionId: claims.session_id };
}

export async function runHrActivation({ db, auth, invitationId, subjectId, flowId, encryptionKey, apply, approve }) {
  await db.query("BEGIN");
  try {
    const check = await hrActivationPreflight(db, invitationId, subjectId, flowId);
    if (!check.databasePrerequisitesMet) throw new Error("HR activation database prerequisites failed.");
    const stored = await db.query(
      'SELECT "encryptedState" FROM public."AuthFlow" WHERE id=$1::uuid AND kind=\'HR_INVITATION\' AND "hrInvitationId"=$2::uuid AND "hrSubject"=$3::uuid AND "hrPasswordConfirmedAt" IS NOT NULL AND "expiresAt">now() FOR UPDATE',
      [flowId, invitationId, subjectId],
    );
    if (stored.rowCount !== 1) throw new Error("Confirmed HR authentication flow is unavailable.");
    const flow = decodeHrFlow(stored.rows[0].encryptedState, encryptionKey);
    await verifyLiveHrProvider(auth, db, invitationId, subjectId, flowId, flow);
    if (!apply) {
      await db.query("ROLLBACK");
      return { databasePrerequisitesMet: true, providerAal2Verified: true, activated: false };
    }
    if (typeof approve !== "function" || await approve() !== true)
      throw new Error("Operator approval was not granted.");
    const accepted = await db.query(
      "SELECT nolt_private.accept_hr_invitation($1::uuid,$2::uuid,$3::uuid) AS accepted",
      [invitationId, subjectId, flowId],
    );
    if (accepted.rows[0]?.accepted !== true) throw new Error("One-time HR activation rejected.");
    await db.query("COMMIT");
    return { activated: true, subject: subjectId };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  config({ quiet: true });
  const apply = process.argv.includes("--apply");
  const args = process.argv.slice(2).filter(x => x !== "--apply");
  validateRunnerEnvironment(process.env, args, apply);
  if (apply && (!stdin.isTTY || !stdout.isTTY))
    throw new Error("Interactive operator approval is required.");
  const [invitationId, subjectId, flowId] = args;
  const db = new Client({ connectionString: process.env.DIRECT_DATABASE_URL, connectionTimeoutMillis: 15000 });
  try {
    await db.connect();
    const tls = db.connection.stream;
    if (!tls?.encrypted || !tls?.authorized)
      throw new Error("Verified owner database TLS is required.");
    const role = await db.query("SELECT current_user AS name");
    if (!role.rows[0] || role.rows[0].name === "nolt_app")
      throw new Error("Application database role cannot activate HR.");
    const auth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const result = await runHrActivation({
      db, auth, invitationId, subjectId, flowId,
      encryptionKey: process.env.AUTH_ENCRYPTION_KEY, apply,
      approve: async () => {
        const reader = createInterface({ input: stdin, output: stdout });
        try {
          const value = await reader.question("Type the exact approved invitation UUID to activate one HR account: ");
          return value.trim() === invitationId;
        } finally { reader.close(); }
      },
    });
    stdout.write(JSON.stringify(result) + "\n");
  } finally { await db.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(e => { process.stderr.write(e.message + "\n"); process.exitCode = 1; });
