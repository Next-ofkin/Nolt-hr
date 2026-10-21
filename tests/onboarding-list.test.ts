import test from "node:test";
import assert from "node:assert/strict";
import { bucketOf, groupForDisplay, needsAttention, sections } from "../apps/web/src/lib/onboarding-list.js";

const f = (id: string, status: string, required = true, dueDate: string | null = null) => ({ id, title: id, status, required, dueDate });

test("statuses fall into three buckets", () => {
  assert.equal(bucketOf("APPROVED"), "done");
  assert.equal(bucketOf("SUBMITTED"), "waiting");
  assert.equal(bucketOf("EXTERNAL_SUBMITTED"), "waiting");
  for (const s of ["NOT_STARTED", "DRAFT", "CHANGES_REQUIRED"]) assert.equal(bucketOf(s), "todo");
});
test("work sent back by HR comes first, required before optional", () => {
  const s = sections([f("a", "NOT_STARTED"), f("b", "DRAFT", false), f("c", "CHANGES_REQUIRED"), f("d", "DRAFT"), f("e", "APPROVED")]);
  assert.deepEqual(s.todo.map((i) => i.id), ["c", "d", "b", "a"]);
  assert.deepEqual(s.done.map((i) => i.id), ["e"]);
});
test("forms group under their pack, the rest go to 'other'", () => {
  const items = [f("a", "DRAFT"), f("b", "DRAFT"), f("c", "DRAFT")];
  const g = groupForDisplay(items, [{ id: "p1", packName: "P", forms: [{ assignmentId: "b" }, { assignmentId: "a" }] }]);
  assert.deepEqual(g.map((x) => x.key), ["p1", "other"]);
  assert.deepEqual(g[0]!.items.map((i) => i.id), ["b", "a"]);
  assert.deepEqual(g[1]!.items.map((i) => i.id), ["c"]);
});
test("a form in two packs shows once; no packs means one plain group", () => {
  const items = [f("a", "DRAFT")];
  const g = groupForDisplay(items, [
    { id: "p1", packName: "1", forms: [{ assignmentId: "a" }] },
    { id: "p2", packName: "2", forms: [{ assignmentId: "a" }] },
  ]);
  assert.equal(g.length, 1);
  assert.equal(groupForDisplay(items, []).length, 1);
  assert.equal(needsAttention([f("x", "CHANGES_REQUIRED"), f("y", "DRAFT")]), 1);
});
