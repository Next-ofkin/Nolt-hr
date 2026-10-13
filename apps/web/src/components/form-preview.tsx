"use client";
import { FileUp, PenLine } from "lucide-react";
import type { FormContent } from "@nolt/form-schemas";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
export function FormPreview({ content }: { content: FormContent }) {
  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          {content.recipient.toLowerCase()} form
        </p>
        <h3 className="mt-3 break-words text-2xl font-semibold">
          {content.title || "Untitled form"}
        </h3>
        {content.description && (
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
            {content.description}
          </p>
        )}
      </div>
      {content.fields.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          Add a field to see your form take shape.
        </p>
      ) : (
        content.fields.map((field) => (
          <div key={field.id} className="field-preview">
            <Label
              htmlFor={`preview-${field.id}`}
              className="break-words leading-5"
            >
              {field.label}
              {field.required && <span className="text-destructive"> *</span>}
            </Label>
            {field.type === "textarea" ? (
              <Textarea
                id={`preview-${field.id}`}
                placeholder="Enter your answer"
              />
            ) : field.type === "select" ? (
              <select
                id={`preview-${field.id}`}
                className="native-select"
                defaultValue=""
              >
                <option value="" disabled>
                  Select an option
                </option>
                {field.options.map((option, index) => (
                  <option key={index}>{option}</option>
                ))}
              </select>
            ) : field.type === "checkbox" ? (
              <div className="flex items-start gap-2">
                <input
                  id={`preview-${field.id}`}
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                />
                <span className="text-sm text-muted-foreground">I confirm</span>
              </div>
            ) : field.type === "signature" ? (
              <div className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-background p-4 text-center">
                <PenLine size={20} className="text-primary" />
                <p className="text-sm">
                  {field.signatureMethod === "DRAW"
                    ? "Draw your signature"
                    : field.signatureMethod === "UPLOAD"
                      ? "Attach your signature"
                      : "Draw or attach your signature"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Preview only · signing is not enabled yet
                </p>
              </div>
            ) : field.type === "file" ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-5 text-center">
                <FileUp size={20} className="text-primary" />
                <p className="text-sm">
                  {field.attachmentPurpose === "SIGNED_DOCUMENT"
                    ? "Attach a signed document"
                    : "Attach a supporting document"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Preview only · uploads are not enabled yet
                </p>
              </div>
            ) : (
              <Input
                id={`preview-${field.id}`}
                type={
                  field.type === "phone"
                    ? "tel"
                    : field.type === "text"
                      ? "text"
                      : field.type
                }
                placeholder={
                  field.type === "date" ? undefined : "Enter your answer"
                }
              />
            )}
            {field.helpText && (
              <p className="whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
                {field.helpText}
              </p>
            )}
          </div>
        ))
      )}
      <p className="border-t pt-4 text-xs leading-5 text-muted-foreground">
        This is a form preview. Answers are not collected, signed or submitted
        here.
      </p>
    </div>
  );
}
