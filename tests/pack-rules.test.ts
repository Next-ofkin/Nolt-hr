import assert from "node:assert/strict";
import test from "node:test";
import { assignPackSchema, extendPackDeadlineSchema, isPackOverdue, packTemplateSchema, updatePackSchema, publishPackSchema, addCalendarDaysUTC } from "../apps/api/src/pack-rules.js";

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const third = "33333333-3333-4333-8333-333333333333";

const base = {
  name: "New employee",
  employmentType: "Permanent",
  items: [
    { formId: first, formVersionId: second, required: true, order: 0 },
    { formId: third, formVersionId: first, required: false, order: 1 },
  ],
};

test("accepts ordered, immutable form-version references", () => {
  const result = packTemplateSchema.parse(base);
  assert.equal(result.description, "");
  assert.equal(result.items.length, 2);
});

test("rejects duplicate forms even when versions differ", () => {
  const result = packTemplateSchema.safeParse({
    ...base, items: [{ ...base.items[0] }, { ...base.items[1], formId: first }],
  });
  assert.equal(result.success, false);
});

test("rejects duplicate version references and order positions", () => {
  const result = packTemplateSchema.safeParse({
    ...base, items: [{ ...base.items[0] }, { ...base.items[1], formVersionId: second, order: 0 }],
  });
  assert.equal(result.success, false);
});

test("rejects blank pack names, empty packs and unrecognised properties", () => {
  assert.equal(packTemplateSchema.safeParse({ ...base, name: "  " }).success, false);
  assert.equal(packTemplateSchema.safeParse({ ...base, items: [] }).success, false);
  assert.equal(packTemplateSchema.safeParse({ ...base, ownerId: first }).success, false);
});

test("calendar helper handles month and leap-year boundaries", () => {
  assert.equal(addCalendarDaysUTC("2028-02-27", 5), "2028-03-03");
  assert.equal(addCalendarDaysUTC("2026-12-30", 5), "2027-01-04");
});

test("calendar helper rejects bad inputs", () => {
  assert.throws(() => addCalendarDaysUTC("2026-02-30", 5));
  assert.throws(() => addCalendarDaysUTC("2026-10-16", -1));
});

test("draft updates require a positive expected revision", () => {
  assert.equal(updatePackSchema.safeParse({ ...base, expectedRevision: 3 }).success, true);
  assert.equal(updatePackSchema.safeParse({ ...base }).success, false);
  assert.equal(updatePackSchema.safeParse({ ...base, expectedRevision: 0 }).success, false);
  assert.equal(updatePackSchema.safeParse({ ...base, expectedRevision: 1, items: [] }).success, false);
});

test("publishing requires only an expected revision and rejects extra claims", () => {
  assert.equal(publishPackSchema.safeParse({ expectedRevision: 2 }).success, true);
  assert.equal(publishPackSchema.safeParse({ expectedRevision: -1 }).success, false);
  assert.equal(publishPackSchema.safeParse({ expectedRevision: 2, status: "PUBLISHED" }).success, false);
});

test("pack assignment is bound to an existing onboarding case revision", () => {
  const valid = { caseId: first, expectedCaseRevision: 2, dueDate: "2026-11-12" };
  assert.equal(assignPackSchema.safeParse(valid).success, true);
  assert.equal(assignPackSchema.safeParse({ caseId: first, expectedCaseRevision: 2 }).success, true);
  assert.equal(assignPackSchema.safeParse({ ...valid, expectedCaseRevision: 0 }).success, false);
  assert.equal(assignPackSchema.safeParse({ ...valid, caseId: "not-a-uuid" }).success, false);
  assert.equal(assignPackSchema.safeParse({ ...valid, assignedBy: third }).success, false);
});

test("extensions require a date and a documented reason", () => {
  assert.equal(extendPackDeadlineSchema.safeParse({newDueDate:"2026-11-20",reason:"Additional records were requested"}).success,true);
  assert.equal(extendPackDeadlineSchema.safeParse({newDueDate:"2026-11-20",reason:"short"}).success,false);
  assert.equal(extendPackDeadlineSchema.safeParse({newDueDate:"not-a-date",reason:"Additional records were requested"}).success,false);
});
test("overdue is based on calendar date and stops once approved", () => {
  assert.equal(isPackOverdue("2026-10-17","2026-10-18",false),true);
  assert.equal(isPackOverdue("2026-10-18","2026-10-18",false),false);
  assert.equal(isPackOverdue(null,"2026-10-18",false),false);
  assert.equal(isPackOverdue("2026-10-17","2026-10-18",true),false);
});
