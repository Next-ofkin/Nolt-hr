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
          ? data.status === "CHANGES_REQUIRED"
            ? "Corrections resubmitted. Your answers are locked; HR review follows separately."
            : "Form submitted. Your answers are locked; HR review follows separately."
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
    approved = data?.status === "APPROVED",
    changesRequired = data?.status === "CHANGES_REQUIRED",
    isLocked = submitted || approved;
  return (
    <section
      ref={section}
      className="space-y-5 rounded-xl border bg-white p-5"
      aria-label="Employee form response"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">
          {approved
            ? "Approved form"
            : submitted
              ? "Your submitted form"
              : changesRequired
                ? "Update your submission"
                : "Complete your form"}
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
      {changesRequired && data?.latestReview && (
        <div
          role="alert"
          className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900"
        >
          <p className="font-semibold">Changes requested by HR reviewer</p>
          <p className="text-sm">
            {data.latestReview.reason ||
              "Please review and update your answers."}
          </p>
          <p className="text-xs text-amber-700">
            Requested on{" "}
            {new Date(data.latestReview.reviewedAt).toLocaleString()}
          </p>
        </div>
      )}
      {approved && (
        <div
          role="status"
          className="rounded-lg border border-green-300 bg-green-50 p-4 text-green-900"
        >
          <p className="font-semibold">Submission approved</p>
          <p className="text-sm">
            HR has reviewed and approved your submission. Your answers are
            locked.
          </p>
        </div>
      )}
      {data && content && (
        <>
          <p className="text-sm text-muted-foreground">
            Version {content.version} ·{" "}
            {approved
              ? "Approved"
              : submitted
                ? "Submitted — awaiting HR review"
                : changesRequired
                  ? "Changes requested — edit and resubmit"
                  : dirty
                    ? "Unsaved changes"
                    : data.status === "DRAFT"
                      ? "Saved draft"
                      : "Not started"}
          </p>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void persist(true);
            }}
          >
            <fieldset disabled={busy || isLocked} className="min-w-0 space-y-6">
              <FormPreview
                content={content}
                answers={answers}
                errors={errors}
                assignmentId={assignmentId}
                revision={data.revision}
                beforeSign={async () => {
                  if (!session || !data) throw Error("Sign in before signing.");
                  setBusy(true);
                  try {
                    const r = await api.PUT(
                      "/api/v1/me/assignments/{id}/response",
                      {
                        params: { path: { id: assignmentId } },
                        headers: { "x-csrf-token": session.csrfToken },
                        body: { expectedRevision: data.revision, answers },
                      },
                    );
                    if (r.error) throw fail(r.error);
                    setData(r.data);
                    setAnswers(r.data.answers);
                    setDirty(false);
                    return r.data.revision;
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy || isLocked}
                onAnswer={(id, value) => {
                  setAnswers((previous) => {
                    const next = { ...previous, [id]: value };
                    if (
                      content.fields.find((f) => f.id === id)?.type !==
                      "signature"
                    )
                      for (const f of content.fields)
                        if (f.type === "signature") next[f.id] = "";
                    return next;
                  });
                  setDirty(true);
                  setNotice("");
                  setErrors((previous) => ({ ...previous, [id]: "" }));
                }}
              />
              {!isLocked && (
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void persist(false)}
                  >
                    Save draft
                  </Button>
                  <Button type="submit">
                    {changesRequired ? "Resubmit for review" : "Submit form"}
                  </Button>
                </div>
              )}
            </fieldset>
          </form>
          {data.submissions.length > 0 && (
            <div className="space-y-3 border-t pt-4">
              <h3 className="font-semibold">Submission history</h3>
              <ul className="space-y-3">
                {data.submissions.map((s) => (
                  <li
                    key={s.id}
                    className="space-y-1.5 rounded-lg border bg-slate-50/50 p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        Submission {s.version} ·{" "}
                        {new Date(s.submittedAt).toLocaleString()}
                      </p>
                      {s.review ? (
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                            s.review.decision === "APPROVED"
                              ? "bg-green-100 text-green-800 border border-green-300"
                              : "bg-amber-100 text-amber-800 border border-amber-300"
                          }`}
                        >
                          {s.review.decision === "APPROVED"
                            ? "Approved"
                            : "Changes requested"}
                        </span>
                      ) : (
                        <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-muted-foreground border">
                          Awaiting HR review
                        </span>
                      )}
                    </div>
                    {s.review?.reason && (
                      <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded p-2">
                        <strong className="font-medium">HR reason:</strong>{" "}
                        {s.review.reason}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                All submitted versions are preserved for compliance and audit
                evidence.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
