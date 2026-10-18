// Dedicated, read-only provider test. No DB, account creation, invitations or role changes.
// Supply a short-lived test identity access token using an ephemeral environment variable.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { pathToFileURL } from "node:url";

const PRODUCTION_REF = "llslubzdkdnvhbatmfug";
const REF = /^[a-z0-9]{20}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateHrProviderTestConfig(env) {
  if (env.NODE_ENV === "production")
    throw new Error("Read-only provider diagnostic must run on an operator workstation.");
  if (env.HR_PROVIDER_TEST_ENABLED !== "true")
    throw new Error("Dedicated HR provider diagnostic is disabled.");
  const ref = env.HR_PROVIDER_SANDBOX_REF;
  if (!REF.test(ref ?? "") || ref === PRODUCTION_REF)
    throw new Error("An isolated Supabase sandbox is required.");
  if (!env.HR_PROVIDER_SANDBOX_PUBLISHABLE_KEY)
    throw new Error("Sandbox publishable key is required.");
  const subject = env.HR_PROVIDER_TEST_SUBJECT;
  const email = env.HR_PROVIDER_TEST_EMAIL?.trim().toLowerCase();
  if (!UUID.test(subject ?? "") || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Set the exact disposable HR_PROVIDER_TEST_SUBJECT and HR_PROVIDER_TEST_EMAIL.");
  if (!env.HR_PROVIDER_TEST_ACCESS_TOKEN)
    throw new Error("Provide a disposable identity access token through an ephemeral environment variable.");
  return { subject, email, token: env.HR_PROVIDER_TEST_ACCESS_TOKEN, url: `https://${ref}.supabase.co`, key: env.HR_PROVIDER_SANDBOX_PUBLISHABLE_KEY };
}

export async function verifyHrProviderReadOnly(auth, { subject, email, token }) {
  const [identity, claimsResult] = await Promise.all([
    auth.getUser(token), auth.getClaims(token),
  ]);
  const user = identity.data?.user;
  const claims = claimsResult.data?.claims;
  if (identity.error || claimsResult.error || !user || !claims ||
      user.id !== subject || user.email?.trim().toLowerCase() !== email ||
      !user.email_confirmed_at || claims.sub !== subject ||
      claims.aal !== "aal2" ||
      !UUID.test(claims.session_id ?? "") ||
      !user.factors?.some((factor) =>
        factor.factor_type === "totp" && factor.status === "verified"))
    throw new Error("Test identity did not provide verified Supabase TOTP AAL2 evidence.");
  return {
    providerIdentityVerified: true,
    totpAal2Verified: true,
    databaseSessionVerified: false,
    workspaceSessionIssued: false,
    activationAllowed: false,
  };
}

async function main() {
  config({ quiet: true });
  const input = validateHrProviderTestConfig(process.env);
  const client = createClient(input.url, input.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const result = await verifyHrProviderReadOnly(client.auth, input);
  process.stdout.write(JSON.stringify(result) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    process.stderr.write("Read-only Supabase diagnostic failed. Check the disposable identity, token and MFA level.\n");
    process.exitCode = 1;
  });
