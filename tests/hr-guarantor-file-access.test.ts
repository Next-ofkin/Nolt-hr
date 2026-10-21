import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { FilesService, canOpenExternalFile } from "../apps/api/src/files.js";

const hr = { active: true, role: "HR", permissions: [] as string[] };
test("who may open guarantor files", () => {
  assert.equal(canOpenExternalFile(hr), true);
  assert.equal(canOpenExternalFile({ ...hr, role: "EMPLOYEE" }), false);
  assert.equal(canOpenExternalFile({ ...hr, active: false }), false);
  assert.equal(canOpenExternalFile({ ...hr, role: "SOMETHING_OLD" }), false);
  assert.equal(canOpenExternalFile(null), false);
});

const bytes = Buffer.from("%PDF-1.7 test");
const sha = createHash("sha256").update(bytes).digest("hex");
function service(opts: { recipient: string; viewer: typeof hr | null; clean?: boolean; employeeUserId?: string; uploadedBy?: string; reviewer?: boolean }) {
  const db = {
    signatureEvidence: { findUnique: async () => null },
    storedFile: { findUnique: async () => ({
      id: "f", assignmentId: "a", status: opts.clean === false ? "PENDING" : "CONFIRMED",
      scanStatus: opts.clean === false ? "PENDING" : "CLEAN", uploadedBy: opts.uploadedBy ?? "guarantor",
      bucket: "b", storageKey: "k", sha256: sha, fileName: "id.pdf", mimeType: "application/pdf",
      assignment: { formVersion: { recipient: opts.recipient }, onboardingCase: { employee: { userId: opts.employeeUserId ?? "emp" } } },
    }) },
    user: { findUnique: async () => opts.viewer },
    $queryRaw: async () => [{ exists: opts.reviewer ?? false }],
  };
  const storage = { get: async () => bytes };
  return new FilesService(db as never, storage as never);
}

test("HR can open a guarantor's file", async () => {
  const out = await service({ recipient: "GUARANTOR", viewer: hr }).downloadFile("hr1", "f");
  assert.equal(out.fileName, "id.pdf");
});
test("the employee who asked cannot open a guarantor's file", async () => {
  const s = service({ recipient: "GUARANTOR", viewer: { ...hr, role: "EMPLOYEE" }, employeeUserId: "emp", uploadedBy: "guarantor" });
  await assert.rejects(() => s.downloadFile("emp", "f"), /not authorized/);
});
test("another employee cannot open it either", async () => {
  const s = service({ recipient: "REFERENCE", viewer: { ...hr, role: "EMPLOYEE" } });
  await assert.rejects(() => s.downloadFile("someone", "f"), /not authorized/);
});
test("a file that is not clean is still refused to HR", async () => {
  const s = service({ recipient: "GUARANTOR", viewer: hr, clean: false });
  await assert.rejects(() => s.downloadFile("hr1", "f"), /quarantine|rejected/);
});
test("employee files keep their old rules", async () => {
  const own = service({ recipient: "EMPLOYEE", viewer: { ...hr, role: "EMPLOYEE" }, employeeUserId: "emp", uploadedBy: "emp" });
  assert.equal((await own.downloadFile("emp", "f")).fileName, "id.pdf");
  const stranger = service({ recipient: "EMPLOYEE", viewer: { ...hr, role: "EMPLOYEE" }, reviewer: false });
  await assert.rejects(() => stranger.downloadFile("other", "f"), /not authorized/);
  const reviewer = service({ recipient: "EMPLOYEE", viewer: hr, reviewer: true });
  assert.equal((await reviewer.downloadFile("hr1", "f")).fileName, "id.pdf");
});
