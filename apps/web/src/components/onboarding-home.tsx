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
import { useQuery } from "@tanstack/react-query";
import { DeveloperWorkspace } from "./developer-workspace";
import { FormsWorkspace } from "./forms-workspace";
import { WorkspaceAccess } from "./workspace-access";
import { FormPreview } from "./form-preview";
import { Button } from "./ui/button";
import { EmployeeResponse } from "./employee-response";
import { MyOnboardingList } from "./my-onboarding-list";
import { CheckCircle2, CircleDashed, Hourglass, TriangleAlert } from "lucide-react";
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
  // TanStack Query keeps the employee checklist up-to-date after HR reviews,
  // guarantor submissions and pack assignments without interrupting editing.
  const { session } = useAuth();
  const liveOnboarding = useQuery({
    queryKey: ["employee-onboarding", session?.email],
    enabled: Boolean(session?.email),
    queryFn: async () => {
      const r = await api.GET("/api/v1/me/onboarding");
      if (r.error) throw new Error(errorMessage(r.error));
      return r.data;
    },
  });
  useEffect(() => {
    if (liveOnboarding.data) {
      setData(liveOnboarding.data);
      setPackRefresh(value => value + 1);
    }
  }, [liveOnboarding.data]);
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
  return (
    <section className="mx-auto max-w-4xl space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">Your employee workspace</p>
        <h1 className="text-3xl font-semibold">My onboarding</h1>
      </div>
      {(error || liveOnboarding.error) && (
        <div role="alert" className="rounded-lg border p-4">
          <p>{error || (liveOnboarding.error instanceof Error ? liveOnboarding.error.message : "Could not refresh your onboarding checklist.")}</p>
          <Button onClick={() => void load()} disabled={busy}>
            Try again
          </Button>
        </div>
      )}
      {(busy || (liveOnboarding.isPending && !data)) && <p role="status">Loading…</p>}
      {data && !data.employee && (
        <p className="rounded-xl border bg-white p-6">
          Your account is ready. HR will link your employment record using your
          verified email address.
        </p>
      )}
      {data?.employee && (
        <>
          <OnboardingHero
            name={data.employee.fullName}
            subtitle={`${data.employee.department} · ${data.employee.jobTitle}`}
            statuses={data.onboardingCase?.assignments.map((a) => a.status) ?? []}
          />
          {!data.onboardingCase ? (
            <p>HR has not opened your onboarding case yet.</p>
          ) : (
            <>
              <MyOnboardingList
                assignments={data.onboardingCase.assignments}
                refreshKey={packRefresh}
                disabled={busy || responseId !== null}
                onOpen={(id) => {
                  setPreview(null);
                  setResponseId(id);
                }}
                onPreview={(id) =>
                  void (async () => {
                    setBusy(true);
                    setError("");
                    setPreview(null);
                    try {
                      const r = await api.GET("/api/v1/me/assignments/{id}", {
                        params: { path: { id } },
                      });
                      if (r.error) throw new Error(errorMessage(r.error));
                      setPreview(normaliseForm(r.data));
                      setResponseId(null);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Could not load this form.");
                    } finally {
                      setBusy(false);
                    }
                  })()
                }
              />
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

function OnboardingHero({ name, subtitle, statuses }: { name: string; subtitle: string; statuses: string[] }) {
  const total = statuses.length;
  const count = (...k: string[]) => statuses.filter((x) => k.includes(x)).length;
  const done = count("APPROVED");
  const pct = total ? Math.round((done / total) * 100) : 0;
  const cards = [
    { label: "Approved", value: done, icon: CheckCircle2, tint: "bg-emerald-50 text-emerald-700" },
    { label: "Awaiting HR", value: count("SUBMITTED", "EXTERNAL_SUBMITTED"), icon: Hourglass, tint: "bg-indigo-50 text-indigo-700" },
    { label: "Action needed", value: count("CHANGES_REQUIRED"), icon: TriangleAlert, tint: "bg-amber-50 text-amber-700" },
    { label: "To do", value: count("NOT_STARTED", "DRAFT"), icon: CircleDashed, tint: "bg-accent text-primary" },
  ];
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy via-[#010f4c] to-[#04228a] p-6 text-white sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-bright/25 blur-3xl" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bright">Your onboarding</p>
          <h2 className="mt-2 break-words text-2xl font-semibold tracking-tight sm:text-3xl">Welcome, {name}</h2>
          <p className="mt-1 text-sm text-sky-100/80">{subtitle}</p>
          {total > 0 && (
            <div className="mt-6 max-w-md">
              <div className="mb-2 flex justify-between text-xs font-medium text-sky-100">
                <span>{done} of {total} forms approved</span><span>{pct}%</span>
              </div>
              <div role="progressbar" aria-label="Onboarding progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2.5 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-bright transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>
      {total > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cards.map(({ label, value, icon: Icon, tint }) => (
            <div key={label} className="rounded-2xl border bg-white p-4 shadow-sm">
              <span className={`flex size-9 items-center justify-center rounded-xl ${tint}`}><Icon size={18} aria-hidden="true" /></span>
              <p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p>
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
