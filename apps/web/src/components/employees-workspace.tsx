"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@nolt/api-client";
import type { components } from "@nolt/api-client/schema";
import { useAuth } from "./auth-provider";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { EmployeeInvitations } from "./employee-invitations";
import { PackAssignmentPanel } from "./pack-assignment-panel";
import { SubmissionReview } from "./submission-review";
type Detail = components["schemas"]["EmployeeDetailDto"];
type Employee = components["schemas"]["EmployeeDto"];
type Published = components["schemas"]["FormDto"];
const empty = {
  fullName: "",
  email: "",
  employeeNumber: "",
  jobTitle: "",
  department: "",
  employmentType: "",
  startDate: "",
};
const labels = {
  fullName: "Full name",
  email: "Work email",
  employeeNumber: "Employee number (optional)",
  jobTitle: "Job title",
  department: "Department",
  employmentType: "Employment type",
  startDate: "Start date",
};
export function EmployeesWorkspace() {
  const { session } = useAuth();
  const [items, setItems] = useState<Employee[]>([]),
    [next, setNext] = useState<string | null>(null);
  const [q, setQ] = useState(""),
    [department, setDepartment] = useState(""),
    [employmentType, setEmploymentType] = useState(""),
    [startFrom, setStartFrom] = useState(""),
    [startTo, setStartTo] = useState("");
  const [caseStatus, setCaseStatus] = useState<
    "" | "ACTIVE" | "CLOSED" | "NONE"
  >("");
  const [detail, setDetail] = useState<Detail | null>(null),
    [profile, setProfile] = useState(empty),
    [editing, setEditing] = useState(false);
  const [versions, setVersions] = useState<Published[]>([]),
    [versionCursor, setVersionCursor] = useState<string | null>(null),
    [versionQuery, setVersionQuery] = useState(""),
    [versionId, setVersionId] = useState(""),
    [required, setRequired] = useState(true),
    [dueDate, setDueDate] = useState("");
  const [reviewingAssignmentId, setReviewingAssignmentId] = useState<
    string | null
  >(null);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const headers = { "x-csrf-token": session!.csrfToken };
  const list = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      setError("");
      try {
        const r = await api.GET("/api/v1/employees", {
          params: {
            query: {
              q,
              department,
              employmentType,
              ...(caseStatus ? { caseStatus } : {}),
              ...(startFrom ? { startFrom } : {}),
              ...(startTo ? { startTo } : {}),
              ...(cursor ? { cursor } : {}),
            },
          },
        });
        if (r.error) throw new Error(errorMessage(r.error));
        setItems(r.data.items);
        setNext(r.data.nextCursor);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load employees.");
      } finally {
        setLoading(false);
      }
    },
    [q, department, employmentType, startFrom, startTo, caseStatus],
  );
  const initiallyLoaded = useRef(false);
  useEffect(() => {
    if (initiallyLoaded.current) return;
    initiallyLoaded.current = true;
    void list();
  }, []);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Request failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function select(id: string) {
    await action(async () => {
      const r = await api.GET("/api/v1/employees/{id}", {
        params: { path: { id } },
      });
      if (r.error) throw new Error(errorMessage(r.error));
      setDetail(r.data);
      setEditing(false);
    });
  }
  async function loadVersions(cursor?: string) {
    await action(async () => {
      const r = await api.GET("/api/v1/published-form-versions", {
        params: { query: { q: versionQuery, ...(cursor ? { cursor } : {}) } },
      });
      if (r.error) throw new Error(errorMessage(r.error));
      setVersions(cursor ? [...versions, ...r.data.items] : r.data.items);
      setVersionCursor(r.data.nextCursor);
      if (!cursor) setVersionId("");
    });
  }
  const c = detail?.onboardingCase;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">People and onboarding</p>
        <h1 className="text-3xl font-semibold">Employee directory</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create employment records and assign published forms. Invitations and
          submissions are being built.
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive p-4 text-destructive"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border bg-accent p-4">
          {notice}
        </p>
      )}
      <div className="grid min-w-0 gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="min-w-0 space-y-4 rounded-xl border bg-white p-4 sm:p-6">
          <h2 className="text-xl font-semibold">Find employees</h2>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void list();
            }}
          >
            <div className="sm:col-span-2">
              <Label htmlFor="employee-search">
                Name, email or employee number
              </Label>
              <Input
                id="employee-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="department-filter">Department</Label>
              <Input
                id="department-filter"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="type-filter">Employment type</Label>
              <Input
                id="type-filter"
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="case-status">Onboarding case status</Label>
              <select
                id="case-status"
                className="native-select w-full"
                value={caseStatus}
                onChange={(e) =>
                  setCaseStatus(e.target.value as typeof caseStatus)
                }
              >
                <option value="">All cases</option>
                <option value="NONE">No case</option>
                <option value="ACTIVE">Active case</option>
                <option value="CLOSED">Closed case</option>
              </select>
            </div>
            <div>
              <Label htmlFor="start-from">Start date from</Label>
              <Input
                id="start-from"
                type="date"
                value={startFrom}
                onChange={(e) => setStartFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="start-to">Start date to</Label>
              <Input
                id="start-to"
                type="date"
                value={startTo}
                onChange={(e) => setStartTo(e.target.value)}
              />
            </div>
            <Button disabled={loading || busy}>Search employees</Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setDetail(null);
                setEditing(true);
                setProfile(empty);
                setNotice("");
              }}
            >
              New employee
            </Button>
          </form>
          {loading ? (
            <p role="status">Loading employees…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No employees found.</p>
          ) : (
            <ul className="divide-y">
              {items.map((e) => (
                <li key={e.id}>
                  <button
                    disabled={busy}
                    onClick={() => void select(e.id)}
                    className="w-full min-w-0 rounded-lg p-3 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <span className="block break-words font-medium">
                      {e.fullName}
                    </span>
                    <span className="block break-words text-sm text-muted-foreground">
                      {e.department} · {e.jobTitle}
                    </span>
                    <span className="block break-all text-xs text-muted-foreground">
                      {e.email}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {next && (
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => void list(next)}
            >
              Next page
            </Button>
          )}
        </section>
        <section className="min-w-0 space-y-5 rounded-xl border bg-white p-4 sm:p-6">
          {!detail && !editing && (
            <p className="text-muted-foreground">
              Select an employee or create a record to get started.
            </p>
          )}
          {editing && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  const { email, ...employment } = profile;
                  const r = detail
                    ? await api.PUT("/api/v1/employees/{id}", {
                        headers,
                        params: { path: { id: detail.employee.id } },
                        body: {
                          expectedRevision: detail.employee.revision,
                          profile: employment,
                        },
                      })
                    : await api.POST("/api/v1/employees", {
                        headers,
                        body: profile,
                      });
                  if (r.error) throw new Error(errorMessage(r.error));
                  setDetail(r.data);
                  setEditing(false);
                  setNotice("Employee record saved.");
                  await list();
                });
              }}
            >
              <h2 className="text-xl font-semibold">
                {detail ? "Edit employment details" : "Create employee"}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {(Object.keys(empty) as (keyof typeof empty)[]).map((k) => (
                  <div key={k}>
                    <Label htmlFor={`profile-${k}`}>{labels[k]}</Label>
                    <Input
                      id={`profile-${k}`}
                      type={
                        k === "email"
                          ? "email"
                          : k === "startDate"
                            ? "date"
                            : "text"
                      }
                      required={k !== "employeeNumber"}
                      maxLength={
                        k === "email"
                          ? 254
                          : k === "employeeNumber"
                            ? 50
                            : k === "fullName"
                              ? 160
                              : k === "employmentType"
                                ? 80
                                : 120
                      }
                      disabled={busy || (k === "email" && !!detail)}
                      value={profile[k]}
                      onChange={(e) =>
                        setProfile({ ...profile, [k]: e.target.value })
                      }
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                The verified account with this email will be linked. This action
                does not send an invitation. Email ownership cannot be changed
                here.
              </p>
              <Button disabled={busy}>Save employee</Button>{" "}
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </form>
          )}
          {detail && !editing && (
            <>
              <div>
                <h2 className="break-words text-2xl font-semibold">
                  {detail.employee.fullName}
                </h2>
                <p className="break-all text-sm text-muted-foreground">
                  {detail.employee.email}
                </p>
                <p className="mt-2 text-sm">
                  {detail.employee.department} · {detail.employee.jobTitle}
                </p>
                <p className="text-sm">
                  {detail.employee.employmentType} · Starts{" "}
                  {detail.employee.startDate}
                </p>
                <p className="mt-2 text-sm">
                  {detail.employee.userId
                    ? "Verified account linked"
                    : "Awaiting verified account"}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setProfile({
                    fullName: detail.employee.fullName,
                    email: detail.employee.email,
                    jobTitle: detail.employee.jobTitle,
                    department: detail.employee.department,
                    employmentType: detail.employee.employmentType,
                    startDate: detail.employee.startDate,
                    employeeNumber: detail.employee.employeeNumber ?? "",
                  });
                  setEditing(true);
                }}
              >
                Edit employment details
              </Button>
              <EmployeeInvitations
                key={detail.employee.id}
                employeeId={detail.employee.id}
                revision={detail.employee.revision}
              />
              {!c ? (
                <div>
                  <p className="mb-3 text-sm">No active onboarding case.</p>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        const r = await api.POST(
                          "/api/v1/employees/{id}/onboarding-cases",
                          {
                            headers,
                            params: { path: { id: detail.employee.id } },
                            body: {
                              expectedRevision: detail.employee.revision,
                            },
                          },
                        );
                        if (r.error) throw new Error(errorMessage(r.error));
                        setDetail(r.data);
                        setNotice("Onboarding case opened.");
                      })
                    }
                  >
                    Open onboarding case
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 border-t pt-5">
                  <h3 className="font-semibold">Onboarding · Pre-onboarding</h3>
                  <PackAssignmentPanel
                    key={c.id}
                    caseId={c.id}
                    caseRevision={c.revision}
                    employmentType={detail.employee.employmentType}
                    csrfToken={session!.csrfToken}
                    onAssigned={async () => {
                      const refreshed = await api.GET("/api/v1/employees/{id}", {
                        params: { path: { id: detail.employee.id } },
                      });
                      if (refreshed.error || !refreshed.data) throw new Error("Could not reload the employee case.");
                      setDetail(refreshed.data);
                    }}
                  />
                  <ul className="space-y-3">
                    {c.assignments.map((a) => {
                      const hasSubmission =
                        a.status === "SUBMITTED" ||
                        a.status === "CHANGES_REQUIRED" ||
                        a.status === "APPROVED";
                      return (
                        <li
                          key={a.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3.5"
                        >
                          <div className="min-w-0 space-y-1">
                            <p className="break-words font-medium">
                              {a.title} · v{a.version}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                              <span>
                                {a.recipient.toLowerCase()} ·{" "}
                                {a.required ? "Required" : "Optional"}
                              </span>
                              <span>·</span>
                              {a.status === "APPROVED" ? (
                                <Badge className="bg-green-600 hover:bg-green-700 text-xs">
                                  Approved
                                </Badge>
                              ) : a.status === "CHANGES_REQUIRED" ? (
                                <Badge
                                  variant="outline"
                                  className="border-amber-500 text-amber-700 bg-amber-50 text-xs"
                                >
                                  Changes Requested
                                </Badge>
                              ) : a.status === "SUBMITTED" ? (
                                <Badge className="bg-amber-600 hover:bg-amber-700 text-xs">
                                  Submitted — Review Required
                                </Badge>
                              ) : a.status === "DRAFT" ? (
                                <Badge variant="secondary" className="text-xs">
                                  Draft Saved
                                </Badge>
                              ) : (
                                <span className="text-xs">Not started</span>
                              )}
                              {a.dueDate ? (
                                <span>· Due {a.dueDate}</span>
                              ) : null}
                            </div>
                          </div>
                          {hasSubmission && (
                            <Button
                              type="button"
                              size="sm"
                              variant={
                                a.status === "SUBMITTED" ? "default" : "outline"
                              }
                              onClick={() => setReviewingAssignmentId(a.id)}
                            >
                              {a.status === "SUBMITTED"
                                ? "Review submission"
                                : "View submission"}
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {!c.assignments.length && (
                    <p className="text-sm text-muted-foreground">
                      No forms assigned yet.
                    </p>
                  )}
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void loadVersions();
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <Label htmlFor="version-search">
                        Published form title
                      </Label>
                      <Input
                        id="version-search"
                        value={versionQuery}
                        onChange={(e) => setVersionQuery(e.target.value)}
                      />
                    </div>
                    <Button
                      disabled={busy}
                      className="self-end"
                      variant="outline"
                    >
                      Find forms
                    </Button>
                  </form>
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(async () => {
                        const r = await api.POST(
                          "/api/v1/onboarding-cases/{id}/assignments",
                          {
                            headers,
                            params: { path: { id: c.id } },
                            body: {
                              expectedRevision: c.revision,
                              formVersionId: versionId,
                              required,
                              dueDate: dueDate || null,
                            },
                          },
                        );
                        if (r.error) throw new Error(errorMessage(r.error));
                        setDetail({ ...detail, onboardingCase: r.data });
                        setNotice(
                          "Published version assigned. Future form edits will not change it.",
                        );
                        setVersionId("");
                      });
                    }}
                  >
                    <Label htmlFor="published-version">
                      Exact published version
                    </Label>
                    <select
                      id="published-version"
                      className="native-select w-full min-w-0"
                      required
                      value={versionId}
                      onChange={(e) => setVersionId(e.target.value)}
                    >
                      <option value="">Select a published version</option>
                      {versions.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.title} · v{v.version} · {v.recipient.toLowerCase()}
                        </option>
                      ))}
                    </select>
                    {versionCursor && (
                      <Button
                        type="button"
                        disabled={busy}
                        variant="outline"
                        onClick={() => void loadVersions(versionCursor)}
                      >
                        More published versions
                      </Button>
                    )}
                    <Label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={required}
                        onChange={(e) => setRequired(e.target.checked)}
                      />
                      Required item
                    </Label>
                    <div>
                      <Label htmlFor="due-date">Due date (optional)</Label>
                      <Input
                        id="due-date"
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Guarantor and reference forms belong to their recipient.
                      Employees cannot complete them on that person's behalf.
                    </p>
                    <Button disabled={busy || !versionId}>
                      Assign published form
                    </Button>
                  </form>
                </div>
              )}
            </>
          )}
        </section>
      </div>
      {reviewingAssignmentId && detail && (
        <Dialog
          open={!!reviewingAssignmentId}
          onOpenChange={(open) => {
            if (!open) setReviewingAssignmentId(null);
          }}
        >
          <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogTitle className="sr-only">Submission review</DialogTitle>
            <DialogDescription className="sr-only">
              Review the assigned form and record a decision on an exact
              submitted version.
            </DialogDescription>
            <SubmissionReview
              assignmentId={reviewingAssignmentId}
              onClose={() => setReviewingAssignmentId(null)}
              onDecided={async () => {
                await select(detail.employee.id);
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
