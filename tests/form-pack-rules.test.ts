import test from "node:test";
import assert from "node:assert/strict";
import { FormsService } from "../apps/api/src/forms.js";
import { PacksService } from "../apps/api/src/packs.js";

const tx = (over: Record<string, unknown>) => ({
  $queryRaw: async () => [{ id: "x" }],
  ...over,
});
const db = (t: unknown) => ({ $transaction: async (fn: (x: unknown) => unknown) => fn(t) }) as never;

test("a form inside a pack cannot be unpublished", async () => {
  const svc = new FormsService(db(tx({
    formVersion: { findUnique: async () => ({ id: "v1", formId: "f1", version: 1 }) },
    packItem: { count: async () => 1 },
  })));
  await assert.rejects(() => svc.unpublish("a", "v1", { expectedRevision: 2 }), /inside a pack/);
});

test("a published form must be unpublished before it can be deleted", async () => {
  const svc = new FormsService(db(tx({
    form: { findUnique: async () => ({ id: "f1", versions: [{ version: 1, status: "PUBLISHED", title: "T" }] }) },
    formAssignment: { count: async () => 0 },
    packItem: { count: async () => 0 },
  })));
  await assert.rejects(() => svc.deleteForm("a", "f1"), /Unpublish it first/);
});

test("a form inside a pack cannot be deleted even when unpublished", async () => {
  const svc = new FormsService(db(tx({
    form: { findUnique: async () => ({ id: "f1", versions: [{ version: 1, status: "UNPUBLISHED", title: "T" }] }) },
    formAssignment: { count: async () => 0 },
    packItem: { count: async () => 1 },
  })));
  await assert.rejects(() => svc.deleteForm("a", "f1"), /inside a pack/);
});

test("a published pack must be unpublished before it can be deleted", async () => {
  const svc = new PacksService(db(tx({
    packTemplate: { findUnique: async () => ({ status: "PUBLISHED" }) },
  })));
  await assert.rejects(() => svc.remove("a", "p1"), /Unpublish it first/);
});
