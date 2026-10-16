import assert from "node:assert/strict";
import test from "node:test";
import { validateInteractiveProviderEnvironment, verifyInteractiveProvider } from "../scripts/hr-provider-interactive-check.mjs";
const subject = "cbfab129-8d44-4ed3-82a2-d026b09fe902";
const email = "disposable-hr@example.invalid";
const sessionId = "e4b703d5-bf2c-4555-bfb1-6e63d452af3a";
const env = { HR_PROVIDER_TEST_ENABLED:"true",
  HR_PROVIDER_SANDBOX_REF:"abcdefghijklmnopqrst", HR_PROVIDER_SANDBOX_PUBLISHABLE_KEY:"synthetic",
  HR_PROVIDER_TEST_SUBJECT:subject, HR_PROVIDER_TEST_EMAIL:email };
const verifiedUser = { id:subject,email,email_confirmed_at:"confirmed",factors:[{factor_type:"totp",status:"verified"}] };
function clientFixture(aal = "aal2") {
  let passwordCalls = 0, totpCalls = 0;
  const client = { auth: {
    signInWithPassword: async () => {passwordCalls++;return {data:{user:verifiedUser,session:{access_token:"before"}}};},
    mfa: {
      listFactors:async()=>({data:{totp:[{id:"test-factor",factor_type:"totp",status:"verified"}]}}),
      challengeAndVerify:async()=>{totpCalls++;return {error:null};},
    },
    getSession:async()=>({data:{session:{access_token:"after"}}}),
    getUser:async()=>({data:{user:verifiedUser},error:null}),
    getClaims:async()=>({data:{claims:{sub:subject,aal,session_id:sessionId}},error:null}),
  } };
  return {client, calls:()=>({passwordCalls,totpCalls})};
}
test("interactive real-provider diagnostic defaults disabled and pins identity and project", () => {
  assert.throws(()=>validateInteractiveProviderEnvironment({}));
  assert.throws(()=>validateInteractiveProviderEnvironment({...env,HR_PROVIDER_TEST_ENABLED:"false"}));
  assert.throws(()=>validateInteractiveProviderEnvironment({...env,HR_PROVIDER_SANDBOX_REF:"llslubzdkdnvhbatmfug"}));
  assert.deepEqual(validateInteractiveProviderEnvironment(env),{subject,email,url:"https://abcdefghijklmnopqrst.supabase.co",key:"synthetic"});
});
test("interactive diagnostic requires TOTP and returns no application session or activation permission", async()=>{
  const {client,calls}=clientFixture();
  const result=await verifyInteractiveProvider(client,{subject,email},"test-secret","123456");
  assert.equal(result.totpAal2Verified,true);
  assert.equal(result.activationAllowed,false);
  assert.equal(result.workspaceSessionIssued,false);
  assert.deepEqual(calls(),{passwordCalls:1,totpCalls:1});
});
test("interactive diagnostic refuses invalid TOTP before provider login", async()=>{
  const {client,calls}=clientFixture();
  await assert.rejects(verifyInteractiveProvider(client,{subject,email},"test-secret","not-otp"));
  assert.deepEqual(calls(),{passwordCalls:0,totpCalls:0});
});
test("interactive diagnostic rejects AAL1 after successful TOTP", async()=>{
  const {client}=clientFixture("aal1");
  await assert.rejects(verifyInteractiveProvider(client,{subject,email},"test-secret","123456"));
});
