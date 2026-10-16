// Operator-only test of an EXISTING disposable Supabase user. No admin API,
// local database, email, invitation delivery, role change or NOLT session issuance.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { stdin, stdout, stderr } from "node:process";
import { pathToFileURL } from "node:url";
import { verifyHrProviderReadOnly } from "./hr-provider-readonly-check.mjs";

const PROJECT = "https://llslubzdkdnvhbatmfug.supabase.co";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateInteractiveProviderEnvironment(env) {
  if (env.NODE_ENV === "production" || env.HR_PROVIDER_TEST_ENABLED !== "true")
    throw new Error("Operator-only provider test is disabled.");
  if (env.SUPABASE_URL !== PROJECT || env.SUPABASE_PROJECT_REF !== "llslubzdkdnvhbatmfug")
    throw new Error("Unexpected Supabase project.");
  if (!env.SUPABASE_PUBLISHABLE_KEY)
    throw new Error("Supabase publishable key is required.");
  const subject = env.HR_PROVIDER_TEST_SUBJECT;
  const email = env.HR_PROVIDER_TEST_EMAIL?.trim().toLowerCase();
  if (!UUID.test(subject ?? "") || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Specify the exact approved disposable test subject and email.");
  return { subject, email };
}

export async function verifyInteractiveProvider(client, identity, password, otp) {
  if (!password || !/^[0-9]{6}$/.test(otp))
    throw new Error("A test password and six-digit authenticator code are required.");
  const signin = await client.auth.signInWithPassword({ email: identity.email, password });
  if (signin.error || !signin.data?.user || !signin.data?.session ||
      signin.data.user.id !== identity.subject || !signin.data.user.email_confirmed_at)
    throw new Error("Disposable test account login failed or identity does not match.");
  const factors = await client.auth.mfa.listFactors();
  if (factors.error) throw new Error("Unable to list test authenticator factors.");
  const totp = factors.data?.totp?.filter(f => f.factor_type === "totp" && f.status === "verified") ?? [];
  if (totp.length !== 1) throw new Error("Exactly one verified TOTP factor is required for the test identity.");
  const challenge = await client.auth.mfa.challengeAndVerify({ factorId: totp[0].id, code: otp });
  if (challenge.error) throw new Error("Test authenticator verification failed.");
  const session = await client.auth.getSession();
  if (!session.data?.session) throw new Error("Provider did not return a verified session.");
  return verifyHrProviderReadOnly(client.auth, {
    ...identity, token: session.data.session.access_token,
  });
}

async function hiddenQuestion(reader, question) {
  // Hide input, including on redirected output. Never log credentials.
  stdout.write(question);
  const secretOutput = new Writable({ write(_chunk, _enc, callback) { callback(); } });
  const hiddenReader = createInterface({ input: stdin, output: secretOutput, terminal: true });
  try { return (await hiddenReader.question("")).trim(); }
  finally { hiddenReader.close(); stdout.write("\n"); }
}

async function main() {
  config({ quiet: true });
  const identity = validateInteractiveProviderEnvironment(process.env);
  if (!stdin.isTTY || !stdout.isTTY) throw new Error("Interactive local terminal required.");
  stdout.write("Read-only NOLT check: existing disposable identity only. Provider sign-in creates an Auth session.\n");
  const prompt = createInterface({ input: stdin, output: stdout });
  // Do not keep a readline interface open alongside the hidden input interface.
  const answer = await prompt.question(`Confirm disposable test identity ${identity.email} by typing TEST: `);
  prompt.close();
  if (answer.trim() !== "TEST") throw new Error("Operator cancelled provider test.");
  const password = await hiddenQuestion(null, "Test account password (hidden): ");
  const otp = await hiddenQuestion(null, "Current six-digit TOTP (hidden): ");
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  try {
    const result = await verifyInteractiveProvider(client, identity, password, otp);
    stdout.write(JSON.stringify(result) + "\n");
  } finally {
    // Always end the disposable provider session; never print tokens.
    await client.auth.signOut({ scope: "local" }).catch(() => {});
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => { stderr.write("Disposable provider verification failed; no HR activation attempted.\n"); process.exitCode = 1; });
