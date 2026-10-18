"use client";
import { useCallback, useEffect, useState } from "react";
import {
  api,
  errorMessage,
  normaliseForm,
  type FormRecord,
} from "@nolt/api-client";
import type { components } from "@nolt/api-client/schema";
import { useAuth } from "./auth-provider";
import { DeveloperWorkspace } from "./developer-workspace";
import { FormsWorkspace } from "./forms-workspace";
import { WorkspaceAccess } from "./workspace-access";
import { FormPreview } from "./form-preview";
import { Button } from "./ui/button";
import { EmployeeResponse } from "./employee-response";
import { ExternalContact } from "./external-contact";
import { MyPackProgress } from "./my-pack-progress";
export function HomeWorkspace() {
  const { session } = useAuth();
  useEffect(() => {
    if (session?.externalRequestId) window.location.replace("/external");
  }, [session?.externalRequestId]);
  if (session?.externalRequestId)
    return <p role="status">Opening your requested form…</p>;
  if (session?.role === "DEVELOPER") return <DeveloperWorkspace />;
  if (session?.permissions.includes("profile.own"))
    return (
      <WorkspaceAccess permission="profile.own">
        <EmployeeHome />
      </WorkspaceAccess>
    );
  return (
    <WorkspaceAccess>
      <FormsWorkspace />
    </WorkspaceAccess>
  );
}
function EmployeeHome() {
  const [responseId, setResponseId] = useState<string | null>(null);
  const [packRefresh, setPackRefresh] = useState(0);
  const [data, setData] = useState<
      components["schemas"]["MyOnboardingDto"] | null
    >(null),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<FormRecord | null>(null),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      const r = await api.GET("/api/v1/me/onboarding");
      if (r.error) throw new Error(errorMessage(r.error));
      setData(r.data);
      setPackRefresh(value => value + 1);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load your checklist.",
      );
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="mx-auto max-w-4xl space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">Your employee workspace</p>
        <h1 className="text-3xl font-semibold">My onboarding</h1>
      </div>
      {error && (
        <div role="alert" className="rounded-lg border p-4">
          <p>{error}</p>
          <Button onClick={() => void load()} disabled={busy}>
            Try again
          </Button>
        </div>
      )}
      {busy && <p role="status">Loading…</p>}
      {data && !data.employee && (
        <p className="rounded-xl border bg-white p-6">
          Your account is ready. HR will link your employment record using your
          verified email address.
        </p>
      )}
      {data?.employee && (
        <>
          <div className="rounded-xl border bg-white p-6">
            <h2 className="break-words text-xl font-semibold">
              Welcome, {data.employee.fullName}
            </h2>
            <p className="text-sm text-muted-foreground">
              {data.employee.department} · {data.employee.jobTitle}
            </p>
          </div>
          {!data.onboardingCase ? (
            <p>HR has not opened your onboarding case yet.</p>
          ) : (
            <>
              <MyPackProgress refreshKey={packRefresh} />
              <p className="text-sm">
                {
                  data.onboardingCase.assignments.filter((a) => a.required)
                    .length
                }{" "}
                required items ·{" "}
                {
                  data.onboardingCase.assignments.filter((a) => !a.required)
                    .length
                }{" "}
                optional items
              </p>
              <p className="text-sm text-muted-foreground">
                Save your answers as a draft, then submit when complete. Signing
                and sending requests to third parties are being built.
              </p>
              {data.onboardingCase.assignments.length === 0 && (
                <p>No forms assigned yet.</p>
              )}
              <ul className="space-y-3">
                {data.onboardingCase.assignments.map((a) => (
                  <li
                    key={a.id}
                    className="space-y-2 rounded-xl border bg-white p-5"
                  >
                    <h2 className="break-words font-semibold">
                      {a.title} · v{a.version}
                    </h2>
                    <p className="text-sm">
                      {a.required ? "Required" : "Optional"} ·{" "}
                      {a.status === "APPROVED" ? (
                        <span className="font-medium text-green-700">
                          Approved
                        </span>
                      ) : a.status === "CHANGES_REQUIRED" ? (
                        <span className="font-semibold text-amber-700">
                          Changes requested — action required
                        </span>
                      ) : a.status === "SUBMITTED" ? (
                        <span>Submitted — awaiting HR review</span>
                      ) : a.status === "DRAFT" ? (
                        <span>Draft saved</span>
                      ) : (
                        <span>Not started</span>
                      )}
                      {a.dueDate ? ` · Due ${a.dueDate}` : ""}
                    </p>
                    {a.recipient === "EMPLOYEE" ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={busy || responseId !== null}
                          onClick={() => {
                            setPreview(null);
                            setResponseId(a.id);
                          }}
                        >
                          {a.status === "APPROVED"
                            ? "View approved form"
                            : a.status === "CHANGES_REQUIRED"
                              ? "Update & resubmit"
                              : a.status === "SUBMITTED"
                                ? "View submitted form"
                                : a.status === "DRAFT"
                                  ? "Continue form"
                                  : "Fill form"}
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy || responseId !== null}
                          onClick={() =>
                            void (async () => {
                              setBusy(true);
                              setError("");
                              setPreview(null);
                              try {
                                const r = await api.GET(
                                  "/api/v1/me/assignments/{id}",
                                  { params: { path: { id: a.id } } },
                                );
                                if (r.error)
                                  throw new Error(errorMessage(r.error));
                                setPreview(normaliseForm(r.data));
                                setResponseId(null);
                              } catch (e) {
                                setError(
                                  e instanceof Error
                                    ? e.message
                                    : "Could not load this form.",
                                );
                              } finally {
                                setBusy(false);
                              }
                            })()
                          }
                        >
                          Preview assigned form
                        </Button>
                      </div>
                    ) : (
                      <ExternalContact
                        assignmentId={a.id}
                        recipient={a.recipient}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {responseId && (
        <EmployeeResponse
          key={responseId}
          assignmentId={responseId}
          onClose={() => setResponseId(null)}
          onChanged={load}
        />
      )}
      {preview && (
        <div className="space-y-4 rounded-xl border bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              Read-only preview · responses are not saved yet
            </p>
            <Button variant="outline" onClick={() => setPreview(null)}>
              Close preview
            </Button>
          </div>
          <fieldset disabled>
            <FormPreview content={preview} />
          </fieldset>
        </div>
      )}
    </section>
  );
}
