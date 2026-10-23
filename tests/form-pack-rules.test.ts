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

test("an unpublished form that was already sent to employees is soft-deleted, not erased", async () => {
  let updated: Record<string, unknown> | null = null;
  let erased = false;
  const svc = new FormsService(db(tx({
    form: {
      findUnique: async () => ({ id: "f1", deletedAt: null, versions: [{ version: 1, status: "UNPUBLISHED", title: "T" }] }),
      update: async (args: { data: Record<string, unknown> }) => { updated = args.data; return {}; },
      delete: async () => { erased = true; },
    },
    formVersion: { deleteMany: async () => { erased = true; } },
    formAssignment: { count: async () => 3 },
    packItem: { count: async () => 0 },
    auditEvent: { create: async () => ({}) },
    outboxEvent: { create: async () => ({}) },
  })));
  assert.deepEqual(await svc.deleteForm("dev", "f1"), { deleted: true });
  assert.equal(erased, false);
  assert.ok(updated && (updated as { deletedBy: string }).deletedBy === "dev" && (updated as { deletedAt: unknown }).deletedAt instanceof Date);
});

test("an already deleted form cannot be deleted twice", async () => {
  const svc = new FormsService(db(tx({
    form: { findUnique: async () => ({ id: "f1", deletedAt: new Date(), versions: [] }) },
  })));
  await assert.rejects(() => svc.deleteForm("dev", "f1"), /not found/i);
});

test("a pack that employees already have is soft-deleted and their copy is untouched", async () => {
  let updated: Record<string, unknown> | null = null;
  let erased = false;
  const svc = new PacksService(db(tx({
    $queryRaw: async () => [{ id: "p1" }],
    packTemplate: {
      findUnique: async () => ({ status: "DRAFT", name: "Pack", versionNumber: 1, deletedAt: null }),
      update: async (args: { data: Record<string, unknown> }) => { updated = args.data; return {}; },
      delete: async () => { erased = true; },
    },
    packItem: { deleteMany: async () => { erased = true; } },
    auditEvent: { create: async () => ({}) },
    outboxEvent: { create: async () => ({}) },
  })));
  assert.deepEqual(await svc.remove("dev", "p1"), { deleted: true });
  assert.equal(erased, false);
  assert.ok(updated && (updated as { deletedBy: string }).deletedBy === "dev");
});

import { randomUUID } from "node:crypto";
import { createField } from "@nolt/form-schemas";
import { carryAnswers } from "../apps/api/src/forms.js";

test("a half-filled form keeps answers to questions that still exist and drops removed ones", () => {
  assert.deepEqual(carryAnswers({ a: "x", gone: "y", b: 2 }, [{ id: "a" }, { id: "b" }, { id: "new" }]), { a: "x", b: 2 });
  assert.deepEqual(carryAnswers(null, [{ id: "a" }]), {});
  assert.deepEqual(carryAnswers(["a"], [{ id: "a" }]), {});
});

test("publishing a new version rolls it out to unfinished forms and carries their drafts", async () => {
  const keep = randomUUID(), removed = randomUUID();
  const field = { ...createField("text", keep), label: "Name" };
  const updates: { where: { assignmentId: string }; data: { answers: unknown; revision: unknown } }[] = [];
  let rolloutCalled = false;
  const row = { id: "v2", formId: "f1", version: 2, revision: 3, status: "DRAFT", title: "Details", description: "", recipient: "EMPLOYEE", fields: [field], publishedAt: null, updatedAt: new Date() };
  const t = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      if (String(strings.join(" ")).includes("advance_waiting_assignments")) { rolloutCalled = true; return [{ assignment_id: "a1" }, { assignment_id: "a2" }]; }
      return [{ id: "x" }];
    },
    formVersion: { findUnique: async () => row, updateMany: async () => ({ count: 1 }), findUniqueOrThrow: async () => ({ ...row, status: "PUBLISHED" }) },
    employeeResponse: {
      findMany: async () => [{ assignmentId: "a2", answers: { [keep]: "Ada", [removed]: "old" } }],
      update: async (args: (typeof updates)[number]) => { updates.push(args); return {}; },
    },
    auditEvent: { create: async () => ({}) },
    outboxEvent: { create: async () => ({}) },
  };
  const svc = new FormsService({
    $transaction: async (fn: (x: unknown) => unknown) => fn(t),
    formAssignment: { groupBy: async () => [] },
    packItem: { groupBy: async () => [] },
  } as never);
  await svc.publish("dev", "v2", { expectedRevision: 3 });
  assert.equal(rolloutCalled, true);
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].data.answers, { [keep]: "Ada" });
  assert.deepEqual(updates[0].data.revision, { increment: 1 });
});
