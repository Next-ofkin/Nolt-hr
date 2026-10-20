import test from "node:test";
import assert from "node:assert/strict";
import { HrExportService, zipFiles } from "../apps/api/dist/hr-export.js";
import { createHash } from "node:crypto";

const assignmentId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const fileId = "33333333-3333-4333-8333-333333333333";
const fieldId = "44444444-4444-4444-8444-444444444444";
const reviewerId = "55555555-5555-4555-8555-555555555555";

function setup() {
  const db = {
    user: { findUnique: async () => ({ active:true, role:"HR" }) },
    formAssignment: { findUnique: async () => ({
      formVersion: {recipient:"EMPLOYEE", title:"Personal Details",version:1,
        fields:[{id:fieldId, label:"Proof of address",type:"file"}]},
      onboardingCase:{employee:{fullName:"Example Employee",email:"employee@example.invalid"}},
      submissions:[{ version:1, submittedAt:new Date("2026-10-19T08:30:00Z"),
        answers:{[fieldId]:fileId},
        review:{decision:"APPROVED",reviewedAt:new Date("2026-10-20T09:00:00Z"),
          reviewedBy:reviewerId,reviewer:{name:"Aisha Bello"}}}],
    }) },
    storedFile: {findMany:async()=>[{id:fileId,fieldId,status:"CONFIRMED",
      scanStatus:"CLEAN",signature:null, sha256:createHash("sha256").update("example private evidence").digest("hex")}]},
    onboardingCase:{findUnique:async()=>({
      employee:{fullName:"Example Employee"},
      assignments:[{id:assignmentId,formVersion:{title:"Personal Details"}}],
    })},
  };
  const files={downloadFile:async()=>({
    buffer:Buffer.from("example private evidence"),
    fileName:"address-document.pdf",
    mimeType:"application/pdf",
  })};
  return new HrExportService(db as never,files as never);
}

test("individual form PDF uses reviewer name and a login-free shareable attachment URL",async()=>{
  const previous=process.env.PUBLIC_APP_URL;
  process.env.PUBLIC_APP_URL="https://nolt-web-production.up.railway.app";
  try {
    const r=await setup().render(reviewerId,assignmentId);
    const source=r.pdf.toString("latin1");
    assert(source.startsWith("%PDF-1.4"));
    assert(source.includes("(Aisha Bello)"));
    assert(source.includes("(/api/v1/")===false);
    assert(source.includes("/Subtype /Link"));
    assert(source.includes("https://nolt-web-production.up.railway.app/api/v1/shared-files/"));
    assert(source.includes("?token="));
    assert(source.includes("Open attached document"));
    assert(!source.includes("requires an authorised NOLT HR sign-in"));
    assert(!source.includes("Reviewer record:"));
    assert(!source.includes("Evidence reference:"));
    assert.equal(r.attachments.length,1);
  } finally {
    if(previous===undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL=previous;
  }
});

test("employee case ZIP includes summary, an individual form PDF, and original attachment",async()=>{
  const previous=process.env.PUBLIC_APP_URL;
  process.env.PUBLIC_APP_URL="https://nolt-web-production.up.railway.app";
  try {
    const result=await setup().caseArchive(reviewerId,caseId);
    const data=result.buffer.toString("latin1");
    assert.equal(result.filename,"Example Employee_Completed_Forms.zip");
    assert.equal(result.buffer.readUInt32LE(0),0x04034b50);
    assert(data.includes("00_Completed_Forms_Summary.pdf"));
    assert(data.includes("01_Personal Details.pdf"));
    assert(data.includes("address-document.pdf"));
  } finally {
    if(previous===undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL=previous;
  }
});

test("ZIP creator produces standard ZIP local and directory headers",()=>{
  const archive=zipFiles([{name:"test.txt",bytes:Buffer.from("hello world")}]);
  assert.equal(archive.readUInt32LE(0),0x04034b50);
  assert(archive.includes(Buffer.from("test.txt")));
  assert.equal(archive.readUInt32LE(archive.length-22),0x06054b50);
});
