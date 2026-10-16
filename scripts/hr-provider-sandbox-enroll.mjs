// Isolated Supabase sandbox ONLY. Opens a temporary loopback QR view; never logs secrets.
import { createClient } from "@supabase/supabase-js";
import { createServer } from "node:http";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, stderr } from "node:process";
import { config } from "dotenv";
import { pathToFileURL } from "node:url";
import { validateInteractiveProviderEnvironment, hiddenQuestion } from "./hr-provider-interactive-check.mjs";

export async function enrollSandboxTotp(auth, identity, password, getCode, showQr) {
  if (!password || typeof getCode !== "function") throw Error("Password and local code prompt required.");
  let signed;
  try { signed = await auth.signInWithPassword({ email: identity.email, password }); }
  catch { throw Error("Sandbox provider sign-in network request failed."); }
  if (signed.error) throw Error("Sandbox sign-in rejected: check password, email confirmation and Auth settings.");
  if (!signed.data?.session || !signed.data?.user?.email_confirmed_at)
    throw Error("Sandbox login has no confirmed session; check email confirmation.");
  if (signed.data.user.id !== identity.subject)
    throw Error("Sandbox account UUID does not match HR_PROVIDER_TEST_SUBJECT.");
  const factors = await auth.mfa.listFactors();
  if (factors.error) throw Error("Sandbox authenticator factor listing failed.");
  if (factors.data?.totp?.some(f => f.status === "verified"))
    throw Error("An authenticator is already verified; use the provider-interactive check.");
  const enrolled = await auth.mfa.enroll({ factorType: "totp", friendlyName: "NOLT sandbox QA" });
  if (enrolled.error || !enrolled.data?.id || !enrolled.data?.totp?.qr_code)
    throw Error("Sandbox TOTP enrollment failed.");
  const factorId = enrolled.data.id;
  try {
    await showQr(enrolled.data.totp.qr_code);
    const code = await getCode();
    if (!/^[0-9]{6}$/.test(code)) throw Error("A six-digit authenticator code is required.");
    const checked = await auth.mfa.challengeAndVerify({ factorId, code });
    if (checked.error) throw Error("Authenticator verification failed.");
    const session = await auth.getSession();
    const claims = await auth.getClaims(session.data?.session?.access_token);
    if (session.error || claims.error || claims.data?.claims?.sub !== identity.subject ||
        claims.data?.claims?.aal !== "aal2") throw Error("Sandbox AAL2 assurance was not confirmed.");
    return { sandboxTotpEnrolled: true, providerAal2Verified: true, activationAllowed: false };
  } catch (error) {
    // Only remove the unverified factor this command just created.
    await auth.mfa.unenroll({ factorId }).catch(() => {});
    throw error;
  }
}

export async function showSandboxQr(qrData, waitForScan) {
  if (typeof qrData !== "string" || !qrData.startsWith("data:image/svg+xml;"))
    throw Error("Unexpected sandbox QR code format.");
  const server = createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src data:; style-src 'unsafe-inline'");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (req.url !== "/" || req.method !== "GET") { res.writeHead(404).end(); return; }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end('<!doctype html><meta name="referrer" content="no-referrer"><title>Sandbox TOTP QR</title><h3>Scan in authenticator app</h3><img alt="TOTP enrollment QR" src="'+qrData+'"><p>Close this tab when finished.</p>');
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const url = "http://127.0.0.1:" + server.address().port + "/";
    await waitForScan(url);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function main() {
  config({ quiet: true });
  const identity = validateInteractiveProviderEnvironment(process.env);
  if (!stdin.isTTY || !stdout.isTTY) throw Error("Use an interactive terminal.");
  const reader = createInterface({ input: stdin, output: stdout });
  const client = createClient(identity.url, identity.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    stdout.write("Sandbox project ONLY. No NOLT DB, invitations or role activation.\n");
    if ((await reader.question("Type ENROLL to create one TOTP factor on the disposable test account: ")).trim() !== "ENROLL")
      throw Error("Cancelled.");
    // Read credentials only on the operator's workstation, never in flags or repository files.
    reader.close();
    const password = await hiddenQuestion("Disposable sandbox password (hidden): ");
    const scanReader = createInterface({ input: stdin, output: stdout });
    const result = await enrollSandboxTotp(client.auth, identity, password,
      () => hiddenQuestion("Enter current six-digit authenticator code (hidden): "),
      async qr => showSandboxQr(qr, async url => {
        stdout.write("Open locally on this computer and scan the QR: " + url + "\n");
        await scanReader.question("Press ENTER after scanning the QR code: ");
      }));
    scanReader.close();
    stdout.write(JSON.stringify(result)+"\n");
  } finally {
    reader.close();
    await client.auth.signOut({ scope: "local" }).catch(()=>{});
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(error=>{stderr.write((error instanceof Error ? error.message : "Sandbox enrollment failed.")+"\n");process.exitCode=1;});
