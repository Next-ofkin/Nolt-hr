import assert from "node:assert/strict";
import test from "node:test";
import { packTemplateSchema, addCalendarDaysUTC } from "../apps/api/src/pack-rules.js";

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
