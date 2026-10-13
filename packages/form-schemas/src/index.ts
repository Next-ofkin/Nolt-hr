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
  "signature",
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
    signature: "Your signature",
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
  };
}
