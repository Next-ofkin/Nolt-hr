import { z } from "zod";

/**
 * Pack template inputs are pure contracts. Creating/publishing/assigning a pack
 * must still be authorised and executed transactionally by the API.
 * Never substitute a mutable form ID for a published FormVersion ID.
 */
export const packItemSchema = z.object({
  formId: z.string().uuid(),
  formVersionId: z.string().uuid(),
  required: z.boolean(),
  order: z.number().int().min(0),
}).strict();

export const packTemplateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(""),
  employmentType: z.string().trim().min(1).max(80),
  items: z.array(packItemSchema).min(1).max(100),
}).strict().superRefine((pack, ctx) => {
  const formIds = new Set<string>();
  const versionIds = new Set<string>();
  const positions = new Set<number>();
  for (const [index, item] of pack.items.entries()) {
    for (const [set, value, field] of [
      [formIds, item.formId, "formId"],
      [versionIds, item.formVersionId, "formVersionId"],
    ] as const) {
      if (set.has(value)) {
        ctx.addIssue({ code: "custom", path: ["items", index, field], message: "Duplicate form or version in pack" });
      }
      set.add(value);
    }
    if (positions.has(item.order)) {
      ctx.addIssue({ code: "custom", path: ["items", index, "order"], message: "Pack positions must be unique" });
    }
    positions.add(item.order);
  }
});

/** A deadline requires an explicitly approved calendar-day policy. */
export function addCalendarDaysUTC(startDate: string, days: number): string {
  if (!z.iso.date().safeParse(startDate).success) throw new Error("Invalid start date");
  if (!Number.isSafeInteger(days) || days < 0 || days > 3650) throw new Error("Invalid day count");
  const parsed = new Date(startDate + "T00:00:00.000Z");
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== startDate)
    throw new Error("Invalid start date");
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}
