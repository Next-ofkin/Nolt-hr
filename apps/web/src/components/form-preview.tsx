"use client";
import { FileUp, PenLine } from "lucide-react";
import type { FormContent, Answers } from "@nolt/form-schemas";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SignaturePad } from "./signature-pad";
import { FileUpload } from "./file-upload";

export function FormPreview({
  content,
  answers,
  onAnswer,
  errors = {},
  assignmentId,
  revision = 0,
  beforeSign,
  disabled = false,
}: {
  content: FormContent;
  answers?: Answers;
  onAnswer?: (id: string, value: string | boolean) => void;
  errors?: Record<string, string>;
  assignmentId?: string;
  revision?: number;
  beforeSign?: () => Promise<number>;
  disabled?: boolean;
}) {
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
                disabled={disabled}
                id={`preview-${field.id}`}
                maxLength={10000}
                {...(answers
                  ? {
                      value: String(answers[field.id] ?? ""),
                      onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
                        onAnswer?.(field.id, e.target.value),
                    }
                  : {})}
                aria-invalid={!!errors[field.id]}
                aria-describedby={
                  errors[field.id] ? `error-${field.id}` : undefined
                }
                placeholder="Enter your answer"
              />
            ) : field.type === "select" ? (
              <select
                disabled={disabled}
                id={`preview-${field.id}`}
                className="native-select"
                {...(answers
                  ? {
                      value: String(answers[field.id] ?? ""),
                      onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                        onAnswer?.(field.id, e.target.value),
                    }
                  : { defaultValue: "" })}
                aria-invalid={!!errors[field.id]}
                aria-describedby={
                  errors[field.id] ? `error-${field.id}` : undefined
                }
              >
                <option value="">Select an option</option>
                {field.options.map((option, index) => (
                  <option key={index}>{option}</option>
                ))}
              </select>
            ) : field.type === "checkbox" ? (
              <div className="flex items-start gap-2">
                <input
                  disabled={disabled}
                  id={`preview-${field.id}`}
                  type="checkbox"
                  {...(answers
                    ? {
                        checked: answers[field.id] === true,
                        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                          onAnswer?.(field.id, e.target.checked),
                      }
                    : {})}
                  aria-invalid={!!errors[field.id]}
                  aria-describedby={
                    errors[field.id] ? `error-${field.id}` : undefined
                  }
                  className="mt-1 size-4 accent-primary"
                />
                <span className="text-sm text-muted-foreground">I confirm</span>
              </div>
            ) : field.type === "signature" ? (
              assignmentId ? (
                <SignaturePad
                  assignmentId={assignmentId}
                  fieldId={field.id}
                  allowedMethod={field.signatureMethod}
                  expectedRevision={revision}
                  beforeSign={beforeSign}
                  existingSignatureId={
                    answers?.[field.id] ? String(answers[field.id]) : null
                  }
                  disabled={disabled}
                  onSigned={(sigId) => onAnswer?.(field.id, sigId)}
                  onClear={() => onAnswer?.(field.id, "")}
                />
              ) : (
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
                    Signature preview (interactive in respondent flow)
                  </p>
                </div>
              )
            ) : field.type === "file" || field.type === "passport_photo" ? (
              assignmentId ? (
                <FileUpload
                  assignmentId={assignmentId}
                  fieldId={field.id}
                  purpose={field.type === "passport_photo" ? "SUPPORTING_DOCUMENT" : field.attachmentPurpose}
                  passportPhoto={field.type === "passport_photo"}
                  existingFileId={
                    answers?.[field.id] ? String(answers[field.id]) : null
                  }
                  disabled={disabled}
                  onUploaded={(fileId) => onAnswer?.(field.id, fileId)}
                  onClear={() => onAnswer?.(field.id, "")}
                />
              ) : (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-5 text-center">
                  <FileUp size={20} className="text-primary" />
                  <p className="text-sm">
                    {field.attachmentPurpose === "SIGNED_DOCUMENT"
                      ? "Attach a signed document"
                      : "Attach a supporting document"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    File upload preview (interactive in respondent flow)
                  </p>
                </div>
              )
            ) : (
              <Input
                disabled={disabled}
                id={`preview-${field.id}`}
                maxLength={10000}
                {...(answers
                  ? {
                      value: String(answers[field.id] ?? ""),
                      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                        onAnswer?.(field.id, e.target.value),
                    }
                  : {})}
                aria-invalid={!!errors[field.id]}
                aria-describedby={
                  errors[field.id] ? `error-${field.id}` : undefined
                }
                inputMode={field.type === "number" ? "decimal" : undefined}
                type={
                  answers && field.type === "number"
                    ? "text"
                    : field.type === "phone"
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
            {errors[field.id] && (
              <p id={`error-${field.id}`} className="text-sm text-destructive">
                {errors[field.id]}
              </p>
            )}
          </div>
        ))
      )}
      {!answers && (
        <p className="border-t pt-4 text-xs leading-5 text-muted-foreground">
          This is a form preview. Answers are not collected, signed or submitted
          here.
        </p>
      )}
    </div>
  );
}
