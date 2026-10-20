"use client";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@nolt/api-client";
import type { components } from "@nolt/api-client/schema";
import { useAuth } from "./auth-provider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { ExternalEvidenceReview } from "./external-evidence-review";
type Detail = components["schemas"]["EmployeeDetailDto"];
type Employee = components["schemas"]["EmployeeDto"];
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
  const queryClient = useQueryClient();
  const [items, setItems] = useState<Employee[]>([]),
    [next, setNext] = useState<string | null>(null),
    [page, setPage] = useState(0),
    [pageCursors, setPageCursors] = useState<(string | null)[]>([null]);
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
  const [showFilters, setShowFilters] = useState(false);
  const [externalReviewId, setExternalReviewId] = useState<string | null>(null);
  const [reviewingAssignmentId, setReviewingAssignmentId] = useState<
    string | null
  >(null);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const headers = { "x-csrf-token": session!.csrfToken };
  const list = useCallback(
    async (cursor?: string | null, pageNumber = 0) => {
      setLoading(true);
      setError("");
      try {
        const pageData = await queryClient.fetchQuery({
          queryKey: ["hr-employees", session?.id, pageNumber, cursor ?? null, q, department, employmentType, caseStatus, startFrom, startTo],
          staleTime: 30_000,
          queryFn: async () => {
            const r = await api.GET("/api/v1/employees", {
                      params: {
                        query: {
                          q,
                          department,
                          employmentType,
                          ...(caseStatus ? { caseStatus } : {}),
                          ...(startFrom ? { startFrom } : {}),
                          ...(startTo ? { startTo } : {}),
                          limit: 6,
                          ...(cursor ? { cursor } : {}),
                        },
                      },
                    });
                    if (r.error) throw new Error(errorMessage(r.error));
            return r.data;
          },
        });
        setItems(pageData.items);
        setNext(pageData.nextCursor);
        setPage(pageNumber);
        if (pageNumber === 0) setPageCursors([null]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load employees.");
      } finally {
        setLoading(false);
      }
    },
    [q, department, employmentType, startFrom, startTo, caseStatus, session?.id, queryClient],
  );
  // Read-only background synchronization; mutations still use their explicit
  // CSRF-protected actions and the selected employee does not change.
  const directoryQuery = useQuery({
    queryKey: ["hr-employees", session?.id, page, pageCursors[page], q, department, employmentType, caseStatus, startFrom, startTo],
    enabled: Boolean(session),
    queryFn: async () => {
      const r = await api.GET("/api/v1/employees", {
        params: { query: {
          q, department, employmentType,
          ...(caseStatus ? { caseStatus } : {}),
          ...(startFrom ? { startFrom } : {}),
          ...(startTo ? { startTo } : {}),
          limit: 6,
          ...(pageCursors[page] ? { cursor: pageCursors[page] } : {}),
        } },
      });
      if (r.error) throw new Error(errorMessage(r.error));
      return r.data;
    },
    staleTime: 30_000,
  });
  useEffect(() => {
    if (directoryQuery.data) {
      setItems(directoryQuery.data.items);
      setNext(directoryQuery.data.nextCursor);
      setLoading(false);
    }
  }, [directoryQuery.data]);
  useEffect(() => {
    if (directoryQuery.error) {
      setError(directoryQuery.error instanceof Error ? directoryQuery.error.message : "Unable to refresh employees.");
      setLoading(false);
    }
  }, [directoryQuery.error]);
  const selectedEmployeeQuery = useQuery({
    queryKey: ["hr-employee-detail", session?.id, detail?.employee.id],
    enabled: Boolean(session && detail?.employee.id && !editing && !reviewingAssignmentId),
    queryFn: async () => {
      const id = detail?.employee.id;
      if (!id) throw new Error("No employee selected");
      const r = await api.GET("/api/v1/employees/{id}", { params: { path: { id } } });
      if (r.error) throw new Error(errorMessage(r.error));
      return r.data;
    },
    staleTime: 20_000,
  });
  useEffect(() => {
    if (selectedEmployeeQuery.data && !editing && !reviewingAssignmentId &&
        selectedEmployeeQuery.data.employee.id === detail?.employee.id)
      setDetail(selectedEmployeeQuery.data);
  }, [selectedEmployeeQuery.data, editing, reviewingAssignmentId, detail?.employee.id]);
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
      queryClient.setQueryData(["hr-employee-detail", session?.id, id], r.data);
      setEditing(false);
    });
  }
  const c = detail?.onboardingCase;
  const pendingReviews = c?.assignments.filter(a => ["EXTERNAL_SUBMITTED", "SUBMITTED"].includes(a.status)).length ?? 0;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">People and onboarding</p>
        <h1 className="text-3xl font-semibold">Employee directory</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create employee records, send invitations and assign published onboarding packs.
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
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.45fr)]">
        <section className="min-w-0 space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">Employees</h2><p className="text-xs text-muted-foreground">Choose a colleague to manage onboarding.</p></div><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { setDetail(null); setEditing(true); setProfile(empty); setNotice(""); }}>+ New employee</Button></div>
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
            {showFilters && <><div>
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
            </>}
            <div className="sm:col-span-2 flex flex-wrap items-center gap-2"><Button disabled={loading || busy} size="sm">Search</Button><Button type="button" variant="ghost" size="sm" onClick={() => setShowFilters(value => !value)}>{showFilters ? "Hide filters" : "More filters"}</Button></div>

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
                    className={`w-full min-w-0 rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary ${detail?.employee.id === e.id ? "border-primary bg-primary/5" : "border-transparent hover:border-border hover:bg-accent"}`} aria-current={detail?.employee.id === e.id ? "true" : undefined}
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
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <p className="text-sm text-muted-foreground">Page {page + 1} · 6 employees per page</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={loading || busy || page === 0}
                onClick={() => void list(pageCursors[page - 1] ?? null, page - 1)}>Previous</Button>
              <Button type="button" variant="outline" disabled={loading || busy || !next}
                onClick={() => {
                  if (!next) return;
                  setPageCursors(previous => [...previous.slice(0, page + 1), next]);
                  void list(next, page + 1);
                }}>Next</Button>
            </div>
          </div>
        </section>
        <section className="min-w-0 space-y-5 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
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
                  queryClient.setQueryData(["hr-employee-detail",session?.id,r.data.employee.id],r.data);
                  setEditing(false);
                  setNotice("Employee record saved.");
                  await queryClient.invalidateQueries({queryKey:["hr-employees",session?.id],refetchType:"none"});
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
              <div className="rounded-lg border bg-muted/30 p-4">
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
              <div className="flex flex-wrap gap-2 border-y py-3 text-sm"><Badge variant="secondary">{c ? "Onboarding active" : "No onboarding case"}</Badge>{pendingReviews > 0 && <Badge variant="outline" className="border-amber-400 text-amber-800">{pendingReviews} awaiting HR review</Badge>}</div>
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
                        queryClient.setQueryData(["hr-employee-detail",session?.id,r.data.employee.id],r.data);
                        await queryClient.invalidateQueries({queryKey:["hr-employees",session?.id]});
                        setNotice("Onboarding case opened.");
                      })
                    }
                  >
                    Open onboarding case
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 border-t pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><h3 className="text-lg font-semibold">Onboarding checklist</h3><p className="text-xs text-muted-foreground">Review forms that need attention and track completed work.</p></div>
                    {c.assignments.some(a => a.recipient === "EMPLOYEE" && ["SUBMITTED","APPROVED","CHANGES_REQUIRED"].includes(a.status)) && (
                      <a href={`/api/v1/exports/cases/${c.id}.zip`} download
                        className="inline-flex min-h-10 items-center rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted">
                        Download all completed forms (ZIP)
                      </a>
                    )}
                  </div>
                  <PackAssignmentPanel
                    key={c.id}
                    caseId={c.id}
                    employeeId={detail.employee.id}
                    caseRevision={c.revision}
                    employmentType={detail.employee.employmentType}
                    csrfToken={session!.csrfToken}
                    assignments={c.assignments}
                    onReviewForm={setReviewingAssignmentId}
                    onReviewExternal={setExternalReviewId}
                    onAssigned={async () => {
                      const refreshed = await api.GET("/api/v1/employees/{id}", {
                        params: { path: { id: detail.employee.id } },
                      });
                      if (refreshed.error || !refreshed.data) throw new Error("Could not reload the employee case.");
                      setDetail(refreshed.data);
                      queryClient.setQueryData(["hr-employee-detail",session?.id,refreshed.data.employee.id],refreshed.data);
                      await queryClient.invalidateQueries({queryKey:["hr-employees",session?.id]});
                    }}
                  />
                  {!c.assignments.length && (
                    <p className="text-sm text-muted-foreground">
                      No onboarding forms assigned yet. Choose a published pack above to assign its forms together.
                    </p>
                  )}

                </div>
              )}
            </>
          )}
        </section>
      </div>
      {externalReviewId && detail && (
        <Dialog open onOpenChange={(open) => { if (!open) setExternalReviewId(null); }}>
          <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogTitle className="sr-only">External evidence review</DialogTitle>
            <DialogDescription className="sr-only">Review submitted guarantor or reference answers.</DialogDescription>
            <ExternalEvidenceReview assignmentId={externalReviewId} csrfToken={session!.csrfToken}
              onChanged={async () => { await select(detail.employee.id); }} />
          </DialogContent>
        </Dialog>
      )}
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
