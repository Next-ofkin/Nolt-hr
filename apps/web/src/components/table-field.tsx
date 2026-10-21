"use client";
import { Plus, Trash2 } from "lucide-react";
import { parseTable, type FormField } from "@nolt/form-schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const inputType = { text: "text", number: "text", percent: "text", date: "date", email: "email", phone: "tel" } as const;

/** Rows × columns answer, stored as JSON text. Fixed rows have a read-only first column. */
export function TableField({
  field,
  value,
  onChange,
  disabled,
  invalid,
}: {
  field: FormField;
  value?: string;
  onChange?: (next: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const fixed = field.fixedRows.length > 0;
  const parsed = parseTable(value, field);
  const blank = () => field.columns.map(() => "");
  const rows: string[][] = fixed
    ? field.fixedRows.map((label, i) => {
        const row = (parsed === "invalid" ? [] : parsed)[i] ?? blank();
        return [label, ...row.slice(1)];
      })
    : parsed === "invalid" || parsed.length === 0
      ? [blank()]
      : parsed;
  const interactive = Boolean(onChange);
  const commit = (next: string[][]) => onChange?.(JSON.stringify(next));
  const edit = (r: number, c: number, text: string) =>
    commit(rows.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? text : cell)) : row)));
  return (
    <div className="space-y-3" aria-invalid={invalid}>
      {rows.map((row, r) => (
        <div key={r} className="rounded-xl border border-border bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">
              {fixed ? row[0] : `${field.label.length > 28 ? "Row" : field.label} ${r + 1}`}
            </p>
            {!fixed && rows.length > 1 && (
              <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive" disabled={disabled || !interactive}
                onClick={() => commit(rows.filter((_, i) => i !== r))} aria-label={`Remove row ${r + 1}`}>
                <Trash2 size={14} />
              </Button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {field.columns.map((col, c) =>
              fixed && c === 0 ? null : (
                <label key={c} className="block space-y-1 text-xs font-medium">
                  <span>
                    {col.label}
                    {col.required && <span className="text-destructive"> *</span>}
                  </span>
                  <Input
                    disabled={disabled || !interactive}
                    value={row[c] ?? ""}
                    maxLength={500}
                    type={inputType[col.kind]}
                    inputMode={col.kind === "number" || col.kind === "percent" ? "decimal" : undefined}
                    onChange={(e) => edit(r, c, e.target.value)}
                  />
                </label>
              ),
            )}
          </div>
        </div>
      ))}
      {!fixed && (
        <Button type="button" variant="outline" size="sm" disabled={disabled || !interactive || rows.length >= field.maxRows}
          onClick={() => commit([...rows, blank()])}>
          <Plus size={14} /> Add another row
        </Button>
      )}
      {field.totalEquals && field.columns.some((c) => c.kind === "percent") && (
        <p className="text-xs text-muted-foreground">
          The “{field.columns.find((c) => c.kind === "percent")!.label}” column must add up to {field.totalEquals}.
        </p>
      )}
    </div>
  );
}
