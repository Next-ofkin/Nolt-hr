import assert from "node:assert/strict";
import test from "node:test";
import { enrollSandboxTotp } from "../scripts/hr-provider-sandbox-enroll.mjs";

const identity={subject:"cbfab129-8d44-4ed3-82a2-d026b09fe902",email:"sandbox@example.invalid"};
const make=()=>{
 let verified=0,removed=0;
 const auth={
  signInWithPassword: async()=>({data:{user:{id:identity.subject,email_confirmed_at:"yes"},session:{access_token:"pre"}}}),
  mfa:{
    listFactors:async()=>({data:{totp:[]}}),
    enroll:async()=>({data:{id:"factor",totp:{qr_code:"data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="}}}),
    challengeAndVerify:async()=>{verified++;return {error:null};},
    unenroll:async()=>{removed++;return {error:null};},
  },
  getSession:async()=>({data:{session:{access_token:"post"}}}),
  getClaims:async()=>({data:{claims:{sub:identity.subject,aal:"aal2"}}}),
 };
 return {auth,state:()=>({verified,removed})};
};
test("sandbox enrollment scans QR before asking for TOTP and confirms AAL2",async()=>{
 const x=make(),steps:string[]=[];
 const result=await enrollSandboxTotp(x.auth,identity,"test-password",
  async()=>{steps.push("code");return "123456";},
  async()=>{steps.push("scan");});
 assert.deepEqual(steps,["scan","code"]);
 assert.deepEqual(result,{sandboxTotpEnrolled:true,providerAal2Verified:true,activationAllowed:false});
 assert.deepEqual(x.state(),{verified:1,removed:0});
});
test("sandbox enrollment rejects incorrect code without promoting or issuing sessions",async()=>{
 const x=make();
 await assert.rejects(enrollSandboxTotp(x.auth,identity,"test-password",async()=>"no",async()=>{}));
 assert.deepEqual(x.state(),{verified:0,removed:1});
});
test("sandbox enrollment refuses already verified authenticator",async()=>{
 const x=make();x.auth.mfa.listFactors=async()=>({data:{totp:[{status:"verified"}]}}) as never;
 await assert.rejects(enrollSandboxTotp(x.auth,identity,"test-password",async()=>"123456",async()=>{}));
 assert.deepEqual(x.state(),{verified:0,removed:0});
});
