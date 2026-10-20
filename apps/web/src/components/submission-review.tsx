"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, normaliseForm } from "@nolt/api-client";
import type { components } from "@nolt/api-client/schema";
import { useAuth } from "./auth-provider";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";

type ReviewAssignment = components["schemas"]["ReviewAssignmentDto"];
type Submission = components["schemas"]["SubmissionDto"];

export function SubmissionReview({
  assignmentId,
  onClose,
  onDecided,
}: {
  assignmentId: string;
  onClose: () => void;
  onDecided: () => Promise<void>;
}) {
  const { session } = useAuth();
  const [data, setData] = useState<ReviewAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [mode, setMode] = useState<
    "VIEW" | "CONFIRM_APPROVE" | "REQUEST_CHANGES"
  >("VIEW");
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [access, setAccess] = useState<
    components["schemas"]["ReviewAccessDto"] | null
  >(null);
  const [reviewerEmail, setReviewerEmail] = useState(session?.email ?? "");
  const [sensitivity, setSensitivity] = useState<
    "" | "GENERAL" | "HEALTH" | "FINANCIAL" | "HEALTH_FINANCIAL"
  >("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const gate = await api.GET("/api/v1/assignments/{id}/review-access", {
        params: { path: { id: assignmentId } },
      });
      if (gate.error) throw new Error(errorMessage(gate.error));
      setAccess(gate.data);
      if (!gate.data.canReview) {
        setData(null);
        return;
      }
      const r = await api.GET("/api/v1/assignments/{id}/review", {
        params: { path: { id: assignmentId } },
      });
      if (r.error) throw new Error(errorMessage(r.error));
      setData(r.data);
      if (r.data.submissions.length > 0) {
        setSelectedVersion((prev) =>
          prev !== null && r.data.submissions.some((s) => s.version === prev)
            ? prev
            : r.data.submissions[0].version,
        );
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load submission review.",
      );
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const latestSub = data?.submissions[0] ?? null;
  const selectedSub: Submission | null =
    data?.submissions.find((s) => s.version === selectedVersion) ?? latestSub;

  const isLatest = selectedSub?.version === latestSub?.version;
  const awaitingReview =
    isLatest &&
    data?.status === "SUBMITTED" &&
    selectedSub !== null &&
    !selectedSub.review;

  async function handleApprove() {
    if (!data || !selectedSub || !session) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const r = await api.POST("/api/v1/submissions/{id}/decisions", {
        params: { path: { id: selectedSub.id } },
        headers: { "x-csrf-token": session.csrfToken },
        body: {
          decision: "APPROVED",
          expectedSubmissionVersion: selectedSub.version,
          expectedResponseRevision: data.revision,
        },
      });
      if (r.error) throw new Error(errorMessage(r.error));
      setSuccess(
        "Submission approved. The form answers are permanently locked.",
      );
      setMode("VIEW");
      await load();
      await onDecided();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record approval.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRequestChanges() {
    if (!data || !selectedSub || !session) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      setReasonError("Please enter a specific reason for requesting changes.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    setReasonError("");
    try {
      const r = await api.POST("/api/v1/submissions/{id}/decisions", {
        params: { path: { id: selectedSub.id } },
        headers: { "x-csrf-token": session.csrfToken },
        body: {
          decision: "CHANGES_REQUIRED",
          reason: trimmed,
          expectedSubmissionVersion: selectedSub.version,
          expectedResponseRevision: data.revision,
        },
      });
      if (r.error) throw new Error(errorMessage(r.error));
      setSuccess(
        "Changes requested. The employee can now edit and resubmit their form.",
      );
      setMode("VIEW");
      setReason("");
      await load();
      await onDecided();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to request changes.");
    } finally {
      setBusy(false);
    }
  }

  const content = data ? normaliseForm(data.form) : null;
  async function configure() {
    if (!session || !sensitivity) return;
    setBusy(true);
    setError("");
    try {
      const r = await api.POST("/api/v1/assignments/{id}/review-access", {
        params: { path: { id: assignmentId } },
        headers: { "x-csrf-token": session.csrfToken },
        body: { reviewerEmail, sensitivity },
      });
      if (r.error) throw new Error(errorMessage(r.error));
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not configure review access.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6" aria-label="HR Submission Review">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="break-words text-xl font-bold">
              {content?.title ?? "Review submission"}
            </h2>
            {content && (
              <span className="text-sm text-muted-foreground">
                v{content.version}
              </span>
            )}
          </div>
          {data && (
            <p className="mt-1 text-sm text-muted-foreground">
              Candidate:{" "}
              <strong className="text-foreground">{data.employeeName}</strong> (
              {data.employeeEmail})
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {data?.status === "APPROVED" && (
            <Badge className="bg-green-600 hover:bg-green-700">Approved</Badge>
          )}
          {data?.status === "CHANGES_REQUIRED" && (
            <Badge
              variant="outline"
              className="border-amber-500 text-amber-700 bg-amber-50"
            >
              Changes Requested
            </Badge>
          )}
          {data?.status === "SUBMITTED" && (
            <Badge className="bg-amber-600 hover:bg-amber-700">
              Awaiting HR Review
            </Badge>
          )}
          {data?.status === "DRAFT" && (
            <Badge variant="secondary">Draft in Progress</Badge>
          )}
          {data?.status === "NOT_STARTED" && (
            <Badge variant="secondary">Not Started</Badge>
          )}
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Close review
          </Button>
        </div>
      </div>

      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading submission details…
        </p>
      )}
      {access?.canConfigure && !loading && (
        <form
          className="space-y-4 rounded-lg border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void configure();
          }}
        >
          <h3 className="font-semibold">Assign review access</h3>
          <p className="text-sm text-muted-foreground">
            All active HR colleagues can review submitted employee forms. Individual reviewer assignments are not required.
          </p>
          <div className="space-y-2">
            <Label htmlFor="reviewer-email">Reviewer email</Label>
            <Input
              id="reviewer-email"
              type="email"
              required
              value={reviewerEmail}
              onChange={(e) => setReviewerEmail(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="review-sensitivity">Form sensitivity</Label>
            <select
              id="review-sensitivity"
              className="native-select"
              required
              value={sensitivity}
              onChange={(e) =>
                setSensitivity(e.target.value as typeof sensitivity)
              }
              disabled={busy}
            >
              <option value="">
                Choose the most restrictive applicable category
              </option>
              <option value="GENERAL">General employment information</option>
              <option value="HEALTH">Health information</option>
              <option value="FINANCIAL">Financial information</option>
              <option value="HEALTH_FINANCIAL">
                Health and financial information
              </option>
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            Review access is locked after assignment for audit integrity. Check the reviewer email before saving.
          </p>
          <Button type="submit" disabled={busy || !sensitivity}>
            Save review access
          </Button>
        </form>
      )}
      {access && !access.canConfigure && !access.canReview && !loading && (
        <p role="status">
          You cannot review this form. Only active HR accounts can review employee submissions in active onboarding cases. Contact your administrator if your HR account is not activated.
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <p className="font-semibold">Review action error</p>
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900"
        >
          <p className="font-semibold">Review saved</p>
          <p>{success}</p>
        </div>
      )}

      {data && content && (
        <>
          {/* Version Selector Tabs (if multiple submissions) */}
          {data.submissions.length > 1 && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Submission History & Versions
              </Label>
              <div className="flex flex-wrap gap-2">
                {data.submissions.map((s) => {
                  const isCurrent = s.version === selectedVersion;
                  return (
                    <Button
                      key={s.id}
                      type="button"
                      size="sm"
                      variant={isCurrent ? "default" : "outline"}
                      onClick={() => {
                        setSelectedVersion(s.version);
                        setMode("VIEW");
                      }}
                      className="text-xs"
                    >
                      Version {s.version}
                      {s.version === latestSub?.version ? " (Latest)" : ""}
                      {s.review?.decision === "APPROVED" ? " · Approved" : ""}
                      {s.review?.decision === "CHANGES_REQUIRED"
                        ? " · Changes Req."
                        : ""}
                      {!s.review ? " · Pending" : ""}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Submission Info Bar */}
          {selectedSub ? (
            <div className="rounded-lg border bg-slate-50 p-3 text-xs text-muted-foreground flex flex-wrap justify-between gap-2">
              <span>
                Submission Version <strong>{selectedSub.version}</strong> ·
                Submitted on{" "}
                <strong>
                  {new Date(selectedSub.submittedAt).toLocaleString()}
                </strong>
              </span>
              <span>Evidence ID: {selectedSub.id.slice(0, 8)}…</span>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No submissions have been made for this assignment yet.
            </div>
          )}

          {/* Form Answers View */}
          {selectedSub && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Submitted Answers
              </h3>
              <div className="divide-y rounded-lg border bg-white">
                {content.fields.map((field) => {
                  const raw = selectedSub.answers[field.id];
                  return (
                    <div key={field.id} className="p-4 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label className="font-medium text-sm text-foreground">
                          {field.label}
                          {field.required && (
                            <span className="text-destructive ml-1">*</span>
                          )}
                        </Label>
                        <span className="text-xs text-muted-foreground uppercase">
                          {field.type}
                        </span>
                      </div>
                      <div className="text-sm pt-1">
                        {raw === undefined || raw === null || raw === "" ? (
                          <span className="italic text-muted-foreground">
                            Not answered
                          </span>
                        ) : typeof raw === "boolean" ? (
                          <Badge variant={raw ? "default" : "secondary"}>
                            {raw ? "Yes" : "No"}
                          </Badge>
                        ) : (
                          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded bg-slate-50 p-2 font-mono text-xs border">
                            {String(raw)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Review Decision Evidence Display (if already reviewed) */}
          {selectedSub?.review && (
            <div
              className={`rounded-lg border p-4 space-y-2 text-sm ${
                selectedSub.review.decision === "APPROVED"
                  ? "border-green-200 bg-green-50/60 text-green-950"
                  : "border-amber-200 bg-amber-50/60 text-amber-950"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold flex items-center gap-1.5">
                  Decision:{" "}
                  {selectedSub.review.decision === "APPROVED" ? (
                    <span className="text-green-700 font-bold">Approved</span>
                  ) : (
                    <span className="text-amber-700 font-bold">
                      Changes Requested
                    </span>
                  )}
                </span>
                <span className="text-xs opacity-75">
                  {new Date(selectedSub.review.reviewedAt).toLocaleString()}
                </span>
              </div>
              {selectedSub.review.reason && (
                <div className="text-sm pt-1">
                  <p className="font-medium text-xs opacity-75">
                    Reason given to employee:
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words rounded bg-white/70 p-2 border">
                    {selectedSub.review.reason}
                  </p>
                </div>
              )}
              <p className="text-xs opacity-60 pt-1">
                Recorded by reviewer {selectedSub.review.reviewedBy.slice(0, 8)}
                … · Review records are immutable evidence.
              </p>
            </div>
          )}

          {/* Review Action Panel (when submission is awaiting review) */}
          {awaitingReview && (
            <div className="rounded-xl border bg-slate-50/80 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">
                    HR Review Actions
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Review candidate's submission (Version {selectedSub.version}
                    ). You can approve or request changes with a reason.
                  </p>
                </div>
              </div>

              {mode === "VIEW" && (
                <div className="flex flex-wrap gap-3 pt-2">
                  <Button
                    type="button"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    disabled={busy}
                    onClick={() => setMode("CONFIRM_APPROVE")}
                  >
                    Approve submission
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-amber-400 text-amber-900 hover:bg-amber-100"
                    disabled={busy}
                    onClick={() => {
                      setMode("REQUEST_CHANGES");
                      setReasonError("");
                    }}
                  >
                    Request changes
                  </Button>
                </div>
              )}

              {mode === "CONFIRM_APPROVE" && (
                <div className="rounded-lg border border-green-300 bg-green-50 p-4 space-y-3">
                  <p className="text-sm font-semibold text-green-950">
                    Confirm submission approval?
                  </p>
                  <p className="text-xs text-green-900">
                    Approving will lock the employee's answers permanently for
                    Version {selectedSub.version}. This decision is recorded as
                    immutable audit evidence.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      className="bg-green-600 hover:bg-green-700 text-white"
                      disabled={busy}
                      onClick={() => void handleApprove()}
                    >
                      {busy ? "Approving…" : "Yes, approve submission"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setMode("VIEW")}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {mode === "REQUEST_CHANGES" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleRequestChanges();
                  }}
                  className="rounded-lg border border-amber-300 bg-amber-50/50 p-4 space-y-3"
                >
                  <div>
                    <Label
                      htmlFor="review-reason"
                      className="font-semibold text-sm text-amber-950"
                    >
                      Reason for requested changes{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <p className="text-xs text-amber-900/80 mb-2">
                      Please be specific. The candidate will see this reason in
                      their portal and will be allowed to edit and resubmit
                      their form.
                    </p>
                    <Textarea
                      id="review-reason"
                      rows={3}
                      value={reason}
                      onChange={(e) => {
                        setReason(e.target.value);
                        setReasonError("");
                      }}
                      placeholder="e.g. Please provide your full legal name as it appears on official identification, and clarify the start date."
                      className="bg-white"
                      disabled={busy}
                      required
                    />
                    {reasonError && (
                      <p
                        role="alert"
                        className="text-xs text-destructive mt-1 font-medium"
                      >
                        {reasonError}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                      disabled={busy || !reason.trim()}
                    >
                      {busy ? "Sending…" : "Send change request to employee"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setMode("VIEW")}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
