import { z } from "zod";

export const fieldTypes = [
  "text",
  "textarea",
  "email",
  "phone",
  "number",
  "date",
  "select",
  "checkbox",
  "file",
  "passport_photo",
  "signature",
  "heading",
  "paragraph",
  "table",
] as const;
export const tableColumnKinds = ["text", "number", "date", "email", "phone", "percent"] as const;
/** Display-only blocks: they show text to the respondent and never collect an answer. */
export const displayFieldTypes = ["heading", "paragraph"] as const;
export const isDisplayField = (type: string) =>
  (displayFieldTypes as readonly string[]).includes(type);
/** Employee record values that can be filled in automatically (the employee can still correct them). */
export const prefillKeys = [
  "employee.fullName",
  "employee.email",
  "employee.jobTitle",
  "employee.department",
  "employee.startDate",
  "employee.employmentType",
  "employee.employeeNumber",
] as const;
export const recipientTypes = ["EMPLOYEE", "GUARANTOR", "REFERENCE"] as const;
export const fieldSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(fieldTypes),
  label: z.string().trim().min(1).max(200),
  helpText: z.string().trim().max(1000).default(""),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  signatureMethod: z.enum(["DRAW", "UPLOAD", "EITHER"]).default("EITHER"),
  attachmentPurpose: z
    .enum(["SUPPORTING_DOCUMENT", "SIGNED_DOCUMENT"])
    .default("SUPPORTING_DOCUMENT"),
  /** Long wording for "paragraph" blocks (agreements, instructions). */
  body: z.string().trim().max(12000).default(""),
  /** Show this question only when another question has the given answer. */
  showIf: z
    .object({ fieldId: z.string().uuid(), equals: z.string().trim().min(1).max(200) })
    .nullable()
    .default(null),
  /** "table" fields: the columns, optional fixed first-column rows, and row limits. */
  columns: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        kind: z.enum(tableColumnKinds).default("text"),
        required: z.boolean().default(false),
        /** Lets an HR export (e.g. the AXA sheet) find this column. */
        exportKey: z.string().trim().max(60).nullable().default(null),
      }),
    )
    .max(8)
    .default([]),
  fixedRows: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  maxRows: z.number().int().min(1).max(30).default(10),
  /** When set, the "percent" column of the filled rows must add up to this number (e.g. 100). */
  totalEquals: z.number().int().min(1).max(1000).nullable().default(null),
  /** Lets an HR export (e.g. the AXA enrolment sheet) find this answer. Not shown to employees. */
  exportKey: z.string().trim().max(60).nullable().default(null),
  /** Fill from the employee record when the form is first opened. */
  prefill: z.enum(prefillKeys).nullable().default(null),
});
export const formContentSchema = z
  .object({
    title: z.string().trim().min(1, "Give your form a title.").max(160),
    description: z.string().trim().max(2000).default(""),
    recipient: z.enum(recipientTypes),
    fields: z.array(fieldSchema).max(100),
  })
  .superRefine((data, ctx) => {
    if (new Set(data.fields.map((f) => f.id)).size !== data.fields.length)
      ctx.addIssue({
        code: "custom",
        path: ["fields"],
        message: "Each field must have a unique ID.",
      });
    data.fields.forEach((field, index) => {
      if (field.type === "table" && (field.columns.length < 1 || (field.fixedRows.length === 0 && field.maxRows < 1)))
        ctx.addIssue({
          code: "custom",
          path: ["fields", index, "columns"],
          message: "A table needs at least one column.",
        });
      if (field.showIf) {
        const at = data.fields.findIndex((f) => f.id === field.showIf!.fieldId);
        if (at < 0 || at >= index)
          ctx.addIssue({
            code: "custom",
            path: ["fields", index, "showIf"],
            message: "A condition must depend on a question placed above it.",
          });
      }
      if (
        field.type === "select" &&
        (field.options.length < 2 ||
          new Set(field.options).size !== field.options.length)
      )
        ctx.addIssue({
          code: "custom",
          path: ["fields", index, "options"],
          message: "Choice fields need at least two distinct options.",
        });
    });
  });
export const publishContentSchema = formContentSchema.refine(
  (data) => data.fields.length > 0,
  { path: ["fields"], message: "Add at least one field before publishing." },
);
export const saveFormSchema = z.object({
  expectedRevision: z.number().int().positive(),
  content: formContentSchema,
});
export const revisionSchema = z.object({
  expectedRevision: z.number().int().positive(),
});
export const createFormSchema = z.object({
  title: z.string().trim().min(1).max(160),
  recipient: z.enum(recipientTypes).default("EMPLOYEE"),
});
export type FormField = z.infer<typeof fieldSchema>;
export type FormContent = z.infer<typeof formContentSchema>;
export type Recipient = (typeof recipientTypes)[number];
export const answersSchema = z
  .record(
    z.string().uuid(),
    z.union([z.string().max(10000), z.boolean(), z.null()]),
  )
  .refine(
    (v) =>
      Object.keys(v).length <= 100 &&
      new TextEncoder().encode(JSON.stringify(v)).length <= 100000,
    "Answers exceed the supported size.",
  );
export type Answers = z.infer<typeof answersSchema>;
export const saveResponseSchema = z
  .object({
    expectedRevision: z.number().int().min(0),
    answers: answersSchema,
  })
  .strict();
export const submitResponseSchema = z
  .object({
    expectedRevision: z.number().int().min(0),
    requestKey: z.string().uuid(),
  })
  .strict();
export const reviewDecisionSchema = z
  .object({
    decision: z.enum(["APPROVED", "CHANGES_REQUIRED"]),
    reason: z.string().trim().max(2000).optional().default(""),
    expectedSubmissionVersion: z.number().int().positive(),
    expectedResponseRevision: z.number().int().min(0),
  })
  .strict()
  .refine((d) => d.decision === "APPROVED" || d.reason.length > 0, {
    message: "A specific reason is required when requesting changes.",
    path: ["reason"],
  });
export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>;
export const reviewAccessSchema = z
  .object({
    reviewerEmail: z
      .email()
      .trim()
      .max(254)
      .transform((v) => v.toLowerCase()),
    sensitivity: z.enum(["GENERAL", "HEALTH", "FINANCIAL", "HEALTH_FINANCIAL"]),
  })
  .strict();
export const uploadIntentSchema = z
  .object({
    fieldId: z.string().uuid(),
    purpose: z.enum(["SUPPORTING_DOCUMENT", "SIGNED_DOCUMENT", "SIGNATURE_IMAGE"]),
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(100),
    byteSize: z.number().int().positive().max(10485760),
    requestKey: z.string().uuid(),
  })
  .strict();
export type UploadIntentInput = z.infer<typeof uploadIntentSchema>;

export const uploadPayloadSchema = z
  .object({
    requestKey: z.string().uuid(),
    payloadBase64: z.string().min(1).max(15000000),
  })
  .strict();
export type UploadPayloadInput = z.infer<typeof uploadPayloadSchema>;

export const signatureIntentSchema = z
  .object({
    fieldId: z.string().uuid(),
    signingMethod: z.enum(["DRAWN", "TYPED", "UPLOADED"]),
    consentVersion: z.string().trim().min(1).max(500),
    consentConfirmed: z.literal(true),
    expectedRevision: z.number().int().min(0),
    typedName: z.string().trim().min(1).max(160).optional(),
    signatureImageBase64: z.string().min(1).max(2000000),
    requestKey: z.string().uuid(),
  })
  .strict();
export type SignatureIntentInput = z.infer<typeof signatureIntentSchema>;

/** A table answer is stored as JSON text: a list of rows, each a list of cell texts. */
export function parseTable(value: unknown, field: Pick<FormField, "columns" | "fixedRows" | "maxRows">): string[][] | "invalid" {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) return [];
  if (typeof value !== "string") return "invalid";
  let data: unknown;
  try {
    data = JSON.parse(value);
  } catch {
    return "invalid";
  }
  const limit = Math.max(field.maxRows, field.fixedRows.length);
  if (!Array.isArray(data) || data.length > limit) return "invalid";
  const rows: string[][] = [];
  for (const row of data) {
    if (!Array.isArray(row) || row.length !== field.columns.length) return "invalid";
    if (!row.every((c) => typeof c === "string" && c.length <= 500)) return "invalid";
    rows.push(row as string[]);
  }
  return rows;
}

/** Whether a question is shown, given the current answers. Hidden questions are never required. */
export function fieldVisible(field: FormField, answers: Answers): boolean {
  if (!field.showIf) return true;
  const v = answers[field.showIf.fieldId];
  return typeof v === "string" && v.trim() === field.showIf.equals;
}

export function canonicalAnswersJson(
  fields: FormField[],
  answers: Answers,
): string {
  const nonSignatureFieldIds = fields
    .filter((f) => f.type !== "signature" && !isDisplayField(f.type))
    .map((f) => f.id)
    .sort();
  const canonical: Record<string, unknown> = {};
  for (const id of nonSignatureFieldIds) {
    const val = answers[id];
    canonical[id] = val === undefined ? null : val;
  }
  return JSON.stringify(canonical);
}

export function validateAnswers(
  fields: FormField[],
  input: unknown,
  final: boolean,
) {
  const answers = answersSchema.parse(input);
  const issues: { fieldId: string; message: string }[] = [];
  const known = new Set(fields.map((f) => f.id));
  for (const id of Object.keys(answers))
    if (!known.has(id))
      issues.push({
        fieldId: id,
        message: "This question is not in the assigned form.",
      });
  for (const f of fields) {
    if (isDisplayField(f.type)) continue;
    // A hidden follow-up question is skipped entirely: not required, not checked.
    if (!fieldVisible(f, answers)) continue;
    const v = answers[f.id];
    const empty =
      v === undefined ||
      v === null ||
      (typeof v === "string" && v.trim() === "");
    const add = (message: string) => issues.push({ fieldId: f.id, message });
    if (f.type === "file" || f.type === "passport_photo") {
      if (empty) {
        if (final && f.required) add("This attachment is required.");
      } else if (
        typeof v !== "string" ||
        !z.string().uuid().safeParse(v.trim()).success
      ) {
        add("Invalid attachment reference.");
      }
      continue;
    }
    if (f.type === "signature") {
      if (empty) {
        if (final && f.required) add("Your signature is required.");
      } else if (
        typeof v !== "string" ||
        !z.string().uuid().safeParse(v.trim()).success
      ) {
        add("Invalid signature reference.");
      }
      continue;
    }
    if (f.type === "table") {
      const rows = parseTable(v, f);
      if (rows === "invalid") {
        add("The table could not be read. Please re-enter it.");
        continue;
      }
      if (!final) continue;
      const used = rows.filter((r) => r.some((c, i) => !(f.fixedRows.length && i === 0) && c.trim() !== ""));
      if (f.required && used.length < 1) add("Fill in at least one row.");
      for (const r of used) {
        f.columns.forEach((col, i) => {
          const cell = (r[i] ?? "").trim();
          if (i === 0 && f.fixedRows.length) return;
          if (cell === "") {
            if (col.required) add(`"${col.label}" is needed in every row you fill in.`);
            return;
          }
          if ((col.kind === "number" || col.kind === "percent") && !/^\d+(\.\d+)?$/.test(cell)) add(`"${col.label}" must be a number.`);
          if (col.kind === "email" && !z.email().safeParse(cell).success) add(`"${col.label}" must be a valid email address.`);
          if (col.kind === "date" && !z.iso.date().safeParse(cell).success) add(`"${col.label}" must be a valid date.`);
          if (col.kind === "phone" && !/^\+?[\d ()\-.]{6,40}$/.test(cell)) add(`"${col.label}" must be a valid phone number.`);
        });
      }
      const pct = f.columns.findIndex((c) => c.kind === "percent");
      if (f.totalEquals && pct >= 0 && used.length) {
        const total = used.reduce((n, r) => n + (Number(r[pct]) || 0), 0);
        if (Math.abs(total - f.totalEquals) > 0.001) add(`The "${f.columns[pct].label}" column must add up to ${f.totalEquals} (it adds up to ${total}).`);
      }
      continue;
    }
    if (empty) {
      if (final && f.required) add("This question is required.");
      continue;
    }
    if (f.type === "checkbox") {
      if (typeof v !== "boolean") add("Choose checked or unchecked.");
      else if (final && f.required && !v) add("This confirmation is required.");
      continue;
    }
    if (typeof v !== "string") {
      add("Enter a text answer.");
      continue;
    }
    if (!final) continue;
    const s = v.trim();
    if (f.type === "email" && !z.email().safeParse(s).success)
      add("Enter a valid email address.");
    if (f.type === "number" && !/^-?\d+(\.\d+)?$/.test(s))
      add("Enter a valid number.");
    if (f.type === "date" && !z.iso.date().safeParse(s).success)
      add("Enter a valid calendar date.");
    if (f.type === "phone" && !/^\+?[\d ()\-.]{6,40}$/.test(s))
      add("Enter a valid phone number.");
    if (f.type === "select" && !f.options.includes(v))
      add("Choose one of the listed options.");
  }
  return { answers, issues };
}
export function createField(type: FormField["type"], id: string): FormField {
  const labels: Record<FormField["type"], string> = {
    text: "Short answer",
    textarea: "Long answer",
    email: "Email address",
    phone: "Phone number",
    number: "Number",
    date: "Date",
    select: "Choose an option",
    checkbox: "Confirmation",
    file: "Attach a document",
    passport_photo: "Passport photograph",
    signature: "Your signature",
    heading: "Section heading",
    paragraph: "Information for the employee",
    table: "Table",
  };
  return {
    id,
    type,
    label: labels[type],
    helpText: "",
    required: false,
    options: type === "select" ? ["Option 1", "Option 2"] : [],
    signatureMethod: "EITHER",
    attachmentPurpose: "SUPPORTING_DOCUMENT",
    body: "",
    columns:
      type === "table"
        ? [{ label: "Item", kind: "text" as const, required: true, exportKey: null }, { label: "Details", kind: "text" as const, required: false, exportKey: null }]
        : [],
    fixedRows: [],
    maxRows: 10,
    totalEquals: null,
    showIf: null,
    exportKey: null,
    prefill: null,
  };
}

export { formTemplates, type FormTemplate } from "./templates.js";
