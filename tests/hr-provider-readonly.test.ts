import assert from "node:assert/strict";
import test from "node:test";
import { validateHrProviderTestConfig, verifyHrProviderReadOnly } from "../scripts/hr-provider-readonly-check.mjs";

const subject = "cbfab129-8d44-4ed3-82a2-d026b09fe902";
const sessionId = "e4b703d5-bf2c-4555-bfb1-6e63d452af3a";
const email = "disposable-hr@example.invalid";
const configuration = {
  HR_PROVIDER_TEST_ENABLED: "true",
  HR_PROVIDER_SANDBOX_REF: "abcdefghijklmnopqrst",
  HR_PROVIDER_SANDBOX_PUBLISHABLE_KEY: "synthetic",
  HR_PROVIDER_TEST_SUBJECT: subject,
  HR_PROVIDER_TEST_EMAIL: email,
  HR_PROVIDER_TEST_ACCESS_TOKEN: "synthetic",
};
const auth = {
  getUser: async () => ({ data: { user: { id: subject, email, email_confirmed_at: "yes",
    factors: [{ factor_type: "totp", status: "verified" }] } }, error: null }),
  getClaims: async () => ({ data: { claims: { sub: subject, aal: "aal2",
    session_id: sessionId } }, error: null }),
};
test("provider test is disabled by default and requires a separately named subject", () => {
  assert.throws(() => validateHrProviderTestConfig({}));
  assert.throws(() => validateHrProviderTestConfig({ ...configuration, HR_PROVIDER_TEST_ENABLED: "false" }));
  assert.throws(() => validateHrProviderTestConfig({ ...configuration, HR_PROVIDER_TEST_SUBJECT: undefined }));
  assert.throws(() => validateHrProviderTestConfig({ ...configuration, HR_PROVIDER_SANDBOX_REF: "llslubzdkdnvhbatmfug" }));
  assert.deepEqual(validateHrProviderTestConfig(configuration), {
    subject, email, token: "synthetic", url: "https://abcdefghijklmnopqrst.supabase.co", key: "synthetic",
  });
});
test("read-only provider proof never permits activation or issues sessions", async () => {
  assert.deepEqual(await verifyHrProviderReadOnly(auth, { subject, email, token: "synthetic" }), {
    providerIdentityVerified: true, totpAal2Verified: true,
    databaseSessionVerified: false, workspaceSessionIssued: false, activationAllowed: false,
  });
});
test("provider diagnostic rejects unverified AAL1 and subject or email mismatch", async () => {
  const aal1 = { ...auth, getClaims: async () => ({
    data: { claims: { sub: subject, aal: "aal1", session_id: sessionId } }, error: null,
  }) };
  await assert.rejects(verifyHrProviderReadOnly(aal1, { subject, email, token: "synthetic" }));
  await assert.rejects(verifyHrProviderReadOnly(auth, { subject, email: "wrong@example.invalid", token: "synthetic" }));
  await assert.rejects(verifyHrProviderReadOnly(auth, { subject: sessionId, email, token: "synthetic" }));
});
