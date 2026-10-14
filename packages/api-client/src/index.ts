import createClient from "openapi-fetch";
import type { paths, components } from "./schema.js";
import { formContentSchema, type FormField } from "@nolt/form-schemas";
export const api = createClient<paths>({
  baseUrl: "",
  credentials: "same-origin",
});
export type FormRecord = Omit<components["schemas"]["FormDto"], "fields"> & {
  fields: FormField[];
};
export function normaliseForm(
  value: components["schemas"]["FormDto"],
): FormRecord {
  const content = formContentSchema.parse(value);
  return { ...value, fields: content.fields };
}
export function errorMessage(value: unknown) {
  if (value && typeof value === "object" && "message" in value) {
    const message = (value as { message: unknown }).message;
    return Array.isArray(message) ? message.join(" ") : String(message);
  }
  return "The request could not be completed. Please try again.";
}

api.use({
  onResponse({ response }) {
    if (response.status === 401 && typeof window !== "undefined")
      window.dispatchEvent(new Event("nolt:session-expired"));
  },
});
