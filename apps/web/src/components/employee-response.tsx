"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage, normaliseForm } from "@nolt/api-client";
import type { components } from "@nolt/api-client/schema";
import type { Answers } from "@nolt/form-schemas";
import { useAuth } from "./auth-provider";
import { FormPreview } from "./form-preview";
import { Button } from "./ui/button";
type Response = components["schemas"]["ResponseDto"];
export function EmployeeResponse({
  assignmentId,
  onClose,
  onChanged,
}: {
  assignmentId: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { session } = useAuth();
  const [data, setData] = useState<Response | null>(null),
    [answers, setAnswers] = useState<Answers>({}),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({});
  const started = useRef(false),
    section = useRef<HTMLElement>(null),
    request = useRef<{ revision: number; key: string } | null>(null);
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api.GET("/api/v1/me/assignments/{id}/response", {
        params: { path: { id: assignmentId } },
      });
      if (r.error) throw Error(errorMessage(r.error));
      setData(r.data);
      setAnswers(r.data.answers);
      setDirty(false);
      setErrors({});
      request.current = null;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load your response.",
      );
    } finally {
      setBusy(false);
    }
  }, [assignmentId]);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void load();
    section.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [load]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (busy) return;
    const first = Object.keys(errors).find((id) => errors[id]);
    if (first) document.getElementById(`preview-${first}`)?.focus();
  }, [busy, errors]);
  function fail(value: unknown) {
    const fields =
      value && typeof value === "object" && "fields" in value
        ? (value as { fields?: { fieldId: string; message: string }[] }).fields
        : undefined;
    if (Array.isArray(fields)) {
      setErrors(Object.fromEntries(fields.map((f) => [f.fieldId, f.message])));
      if (fields[0])
        document.getElementById(`preview-${fields[0].fieldId}`)?.focus();
    }
    return Error(errorMessage(value));
  }
  async function persist(submit: boolean) {
    if (!data || !session) return;
    setBusy(true);
    setError("");
    setNotice("");
    setErrors({});
    try {
      const params = { path: { id: assignmentId } },
        headers = { "x-csrf-token": session.csrfToken };
      let current = data;
      if (dirty || !submit) {
        const r = await api.PUT("/api/v1/me/assignments/{id}/response", {
          params,
          headers,
          body: { expectedRevision: data.revision, answers },
        });
        if (r.error) throw fail(r.error);
        current = r.data;
        setData(current);
        setAnswers(current.answers);
        setDirty(false);
        request.current = null;
      }
      if (submit) {
        if (request.current?.revision !== current.revision)
          request.current = {
            revision: current.revision,
            key: crypto.randomUUID(),
          };
        const r = await api.POST(
          "/api/v1/me/assignments/{id}/response/submit",
          {
            params,
            headers,
            body: {
              expectedRevision: current.revision,
              requestKey: request.current.key,
            },
          },
        );
        if (r.error) throw fail(r.error);
        current = r.data;
        setData(current);
        setAnswers(current.answers);
        setDirty(false);
        request.current = null;
      }
      setNotice(
        submit
          ? "Form submitted. Your answers are locked; HR review follows separately."
          : "Draft saved. You can return and continue later.",
      );
      await onChanged();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save your response.",
      );
    } finally {
      setBusy(false);
    }
  }
  const content = data ? normaliseForm(data.form) : null,
    submitted = data?.status === "SUBMITTED",
    blocked = content?.fields.some(
      (f) => f.required && (f.type === "file" || f.type === "signature"),
    );
  return (
    <section
      ref={section}
      className="space-y-5 rounded-xl border bg-white p-5"
      aria-label="Employee form response"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">
          {submitted ? "Your submitted form" : "Complete your form"}
        </h2>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            if (!dirty || window.confirm("Discard your unsaved changes?"))
              onClose();
          }}
        >
          Close form
        </Button>
      </div>
      {busy && <p role="status">Working…</p>}
      {error && (
        <div
          role="alert"
          className="space-y-2 rounded-lg border border-destructive p-3"
        >
          <p>{error}</p>
          <Button
            disabled={busy}
            variant="outline"
            onClick={() => {
              if (
                !dirty ||
                window.confirm("Reload and discard your unsaved changes?")
              )
                void load();
            }}
          >
            Reload saved response
          </Button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {data && content && (
        <>
          <p className="text-sm text-muted-foreground">
            Version {content.version} ·{" "}
            {submitted
              ? "Submitted — awaiting HR review"
              : dirty
                ? "Unsaved changes"
                : data.status === "DRAFT"
                  ? "Saved draft"
                  : "Not started"}
          </p>
          {blocked && !submitted && (
            <p className="rounded-lg border p-3 text-sm">
              This form requires a file or signature. You can save your answers
              now; final submission will be available when capture is enabled.
            </p>
          )}
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void persist(true);
            }}
          >
            <fieldset
              disabled={busy || submitted}
              className="min-w-0 space-y-6"
            >
              <FormPreview
                content={content}
                answers={answers}
                errors={errors}
                onAnswer={(id, value) => {
                  setAnswers((previous) => ({ ...previous, [id]: value }));
                  setDirty(true);
                  setNotice("");
                  setErrors((previous) => ({ ...previous, [id]: "" }));
                }}
              />
              {!submitted && (
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void persist(false)}
                  >
                    Save draft
                  </Button>
                  <Button type="submit" disabled={blocked}>
                    Submit form
                  </Button>
                </div>
              )}
            </fieldset>
          </form>
          {data.submissions.length > 0 && (
            <div className="space-y-3 border-t pt-4">
              <h3 className="font-semibold">Submission history</h3>
              {data.submissions.map((s) => (
                <div key={s.id} className="space-y-2 text-sm">
                  <p>
                    Submission {s.version} ·{" "}
                    {new Date(s.submittedAt).toLocaleString()} · form v
                    {content.version}
                  </p>
                  <p className="text-muted-foreground">
                    Submitted answers are preserved. Corrections will use a
                    separate review cycle.
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
