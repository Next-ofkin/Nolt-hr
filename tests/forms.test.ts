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
