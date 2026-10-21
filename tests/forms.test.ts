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
