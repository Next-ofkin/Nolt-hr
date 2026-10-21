import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createField,
  formContentSchema,
  publishContentSchema,
} from "@nolt/form-schemas";

test("drafts can have no fields; publication requires at least one", () => {
  const content = {
    title: "Employee details",
    description: "",
    recipient: "EMPLOYEE",
    fields: [],
  };
  assert.equal(formContentSchema.safeParse(content).success, true);
  assert.equal(publishContentSchema.safeParse(content).success, false);
});
test("choice rules and stable field IDs are validated before saving", () => {
  const field = createField("select", randomUUID());
  const content = { title: "Details", recipient: "GUARANTOR", fields: [field] };
  assert.equal(formContentSchema.safeParse(content).success, true);
  assert.equal(
    formContentSchema.safeParse({ ...content, fields: [field, field] }).success,
    false,
  );
  assert.equal(
    formContentSchema.safeParse({
      ...content,
      fields: [{ ...field, options: ["Same", "Same"] }],
    }).success,
    false,
  );
  assert.equal(
    formContentSchema.safeParse({
      ...content,
      fields: [{ ...field, options: [""] }],
    }).success,
    false,
  );
});
test("signatures and signed-document fields preserve HR configuration", () => {
  const signature = {
    ...createField("signature", randomUUID()),
    required: true,
    signatureMethod: "UPLOAD",
  };
  const file = {
    ...createField("file", randomUUID()),
    attachmentPurpose: "SIGNED_DOCUMENT",
  };
  const result = publishContentSchema.parse({
    title: "Guarantor undertaking",
    recipient: "GUARANTOR",
    fields: [signature, file],
  });
  assert.equal(result.fields[0].signatureMethod, "UPLOAD");
  assert.equal(result.fields[1].attachmentPurpose, "SIGNED_DOCUMENT");
  assert.equal(
    formContentSchema.safeParse({ ...result, recipient: "SOMEONE_ELSE" })
      .success,
    false,
  );
});

test("passport photograph is a valid attachment field without changing existing forms", () => {
  const passport = { ...createField("passport_photo", randomUUID()), required: true };
  assert.equal(passport.attachmentPurpose, "SUPPORTING_DOCUMENT");
  const content = publishContentSchema.parse({
    title: "Employee identity",
    recipient: "EMPLOYEE",
    fields: [passport],
  });
  assert.equal(content.fields[0].type, "passport_photo");
  assert.equal(formContentSchema.safeParse({
    ...content,
    fields: [createField("file", randomUUID()), passport],
  }).success, true);
});

// Keep these rules executable independently of hosted Supabase.
import { canDeleteUnpublishedDraft } from "../apps/api/src/forms.js";
test("only a never-published, never-assigned single draft is deletable", () => {
  assert.equal(canDeleteUnpublishedDraft([{ status: "DRAFT" }], 0), true);
  assert.equal(canDeleteUnpublishedDraft([{ status: "DRAFT" }], 1), false);
  assert.equal(canDeleteUnpublishedDraft([{ status: "PUBLISHED" }], 0), false);
  assert.equal(canDeleteUnpublishedDraft([{ status: "UNPUBLISHED" }], 0), false);
  assert.equal(canDeleteUnpublishedDraft([{ status: "PUBLISHED" }, { status: "DRAFT" }], 0), false);
});

import { canonicalAnswersJson, fieldVisible, validateAnswers } from "@nolt/form-schemas";
import { withPrefill } from "../apps/api/src/responses.js";

test("headings and wording blocks collect no answers and are never required", () => {
  const heading = { ...createField("heading", randomUUID()), label: "Health information" };
  const text = { ...createField("paragraph", randomUUID()), body: "Read carefully." };
  const name = { ...createField("text", randomUUID()), required: true };
  const { issues } = validateAnswers([heading, text, name], { [name.id]: "Ada" }, true);
  assert.deepEqual(issues, []);
  assert.equal(canonicalAnswersJson([heading, text, name], { [name.id]: "Ada" }), JSON.stringify({ [name.id]: "Ada" }));
});

test("a follow-up question is only required, and only visible, after the matching answer", () => {
  const yesNo = { ...createField("select", randomUUID()), options: ["Yes", "No"], required: true };
  const details = { ...createField("textarea", randomUUID()), required: true, showIf: { fieldId: yesNo.id, equals: "Yes" } };
  const content = { title: "Declaration", recipient: "EMPLOYEE", fields: [yesNo, details] };
  assert.equal(formContentSchema.safeParse(content).success, true);
  // The condition must point at a question placed above it.
  assert.equal(formContentSchema.safeParse({ ...content, fields: [details, yesNo] }).success, false);
  assert.equal(fieldVisible(details, { [yesNo.id]: "No" }), false);
  assert.deepEqual(validateAnswers([yesNo, details], { [yesNo.id]: "No" }, true).issues, []);
  const missing = validateAnswers([yesNo, details], { [yesNo.id]: "Yes" }, true).issues;
  assert.deepEqual(missing.map((i) => i.fieldId), [details.id]);
  assert.deepEqual(validateAnswers([yesNo, details], { [yesNo.id]: "Yes", [details.id]: "Explained" }, true).issues, []);
});

test("employee details fill in only where the employee has not answered", () => {
  const a = { ...createField("text", randomUUID()), prefill: "employee.fullName" };
  const b = { ...createField("text", randomUUID()), prefill: "employee.jobTitle" };
  const employee = { fullName: "Ada Obi", email: "a@x.test", jobTitle: "Analyst", department: "Credit",
    startDate: new Date("2026-10-01T00:00:00Z"), employmentType: "Full-time", employeeNumber: null };
  const out = withPrefill([a, b], { [b.id]: "Senior Analyst" }, employee);
  assert.equal(out[a.id], "Ada Obi");
  assert.equal(out[b.id], "Senior Analyst");
});

import { formTemplates } from "@nolt/form-schemas";
test("every NOLT template is a valid, publishable form with sound conditions", () => {
  assert.ok(formTemplates.length >= 2);
  for (const t of formTemplates) {
    const content = t.build();
    const parsed = publishContentSchema.safeParse(content);
    assert.equal(parsed.success, true, `${t.title}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 2))}`);
    assert.ok(content.fields.length <= 100, `${t.title} stays within the 100-field limit`);
  }
});

import { isDisplayField } from "@nolt/form-schemas";
import type { FormField } from "@nolt/form-schemas";

function completeAnswers(fields: FormField[]) {
  const a: Record<string, string | boolean> = {};
  for (const f of fields) {
    if (isDisplayField(f.type)) continue;
    if (f.type === "checkbox") a[f.id] = true;
    else if (f.type === "select") a[f.id] = f.options[0];
    else if (f.type === "email") a[f.id] = "a@b.co";
    else if (f.type === "phone") a[f.id] = "08012345678";
    else if (f.type === "number") a[f.id] = "1";
    else if (f.type === "date") a[f.id] = "2026-01-01";
    else if (["file", "passport_photo", "signature"].includes(f.type)) a[f.id] = randomUUID();
    else if (f.type === "table") {
      const row = (label?: string) => f.columns.map((c, i) =>
        label && i === 0 ? label : c.kind === "percent" ? String(f.totalEquals ?? 100) : c.kind === "email" ? "a@b.co"
        : c.kind === "number" ? "1" : c.kind === "date" ? "2026-01-01" : c.kind === "phone" ? "08012345678" : "x");
      a[f.id] = JSON.stringify(f.fixedRows.length ? f.fixedRows.map(row) : [row()]);
    } else a[f.id] = "x";
  }
  return a;
}

test("every template can be fully and correctly completed, and blank required forms are refused", () => {
  for (const t of formTemplates) {
    const c = t.build();
    const ok = validateAnswers(c.fields, completeAnswers(c.fields), true);
    assert.deepEqual(ok.issues, [], `${t.title} should accept a complete set of answers`);
    const blank = validateAnswers(c.fields, {}, true);
    assert.ok(blank.issues.length > 0, `${t.title} should require answers`);
  }
});

test("tables: percentages must total 100, rows must be complete, and work tools are fixed", () => {
  const ben = formTemplates.find((t) => t.key === "beneficiary")!.build();
  const table = ben.fields.find((f) => f.type === "table" && f.label === "Beneficiaries")!;
  const answers = completeAnswers(ben.fields);
  const row = (pct: string) => ["Obi", "Ada", "Sister", pct, "2000-01-01", "0801", "Lagos"];
  answers[table.id] = JSON.stringify([row("60"), row("30")]);
  const bad = validateAnswers(ben.fields, answers, true).issues;
  assert.ok(bad.some((i) => i.fieldId === table.id && /add up to 100/.test(i.message)));
  answers[table.id] = JSON.stringify([row("60"), row("40")]);
  assert.deepEqual(validateAnswers(ben.fields, answers, true).issues, []);
  answers[table.id] = JSON.stringify([["Obi", "", "Sister", "100", "2000-01-01", "0801", "Lagos"]]);
  assert.ok(validateAnswers(ben.fields, answers, true).issues.length > 0);
  answers[table.id] = "not json";
  assert.ok(validateAnswers(ben.fields, answers, true).issues.some((i) => i.fieldId === table.id));
  const tools = formTemplates.find((t) => t.key === "work-tools")!.build();
  const fixed = tools.fields.find((f) => f.label === "Work tools assigned to me")!;
  assert.equal(fixed.fixedRows.length, 7);
  // Leaving every tool empty is allowed (nothing received yet).
  assert.deepEqual(validateAnswers(tools.fields, { ...completeAnswers(tools.fields), [fixed.id]: "" }, true).issues, []);
});
