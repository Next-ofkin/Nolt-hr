"use client";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { Button } from "./ui/button";
import { ExternalContact } from "./external-contact";
import { StatusChip } from "./status-chip";
import { groupForDisplay, needsAttention, sections } from "@/lib/onboarding-list";

type PackProgress = {
  id: string; packName: string; dueDate: string | null; status: string; overdue: boolean;
  requiredForms: number; approvedRequired: number; totalForms: number;
  forms: { assignmentId: string; title: string; required: boolean; status: string }[];
};
export type MyAssignment = {
  id: string; title: string; version: number; status: string; required: boolean;
  dueDate?: string | null; recipient: string;
};

const chipLabel = (status: string) =>
  status === "EXTERNAL_SUBMITTED" ? "Guarantor submitted" : status === "SUBMITTED" ? "Sent to HR" : status === "CHANGES_REQUIRED" ? "Changes requested" : undefined;
const buttonLabel = (status: string) =>
  status === "APPROVED" ? "View" : status === "CHANGES_REQUIRED" ? "Fix and resend" : status === "SUBMITTED" ? "View" : status === "DRAFT" ? "Continue" : "Start";

export function MyOnboardingList({
  assignments, refreshKey, disabled, onOpen, onPreview,
}: {
  assignments: MyAssignment[];
  refreshKey: number;
  disabled: boolean;
  onOpen: (id: string) => void;
  onPreview: (id: string) => void;
}) {
  const packsQuery = useQuery({
    queryKey: ["my-packs"],
    queryFn: async () => {
      const response = await fetch("/api/v1/me/packs", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Your pack progress is temporarily unavailable.");
      return await response.json() as PackProgress[];
    },
  });
  const seen = useRef(refreshKey);
  const { refetch } = packsQuery;
  useEffect(() => {
    if (seen.current === refreshKey) return;
    seen.current = refreshKey;
    void refetch();
  }, [refreshKey, refetch]);

  const packs = packsQuery.data ?? [];
  const groups = groupForDisplay(assignments, packs);
  const attention = needsAttention(assignments);
  if (assignments.length === 0) return <p className="rounded-2xl border bg-white p-5 text-sm">No forms assigned yet.</p>;

  // A plain function, not a component, so a row keeps its state between refreshes.
  function row(a: MyAssignment) {
    const mine = a.recipient === "EMPLOYEE";
    return (
      <li key={a.id} className="rounded-2xl border bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="break-words font-semibold leading-snug">{a.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground">
              <StatusChip status={a.status} label={chipLabel(a.status)} />
              <span>{a.required ? "Required" : "Optional"}{a.dueDate ? ` · Due ${a.dueDate}` : ""}</span>
            </div>
          </div>
          {mine && (
            <Button
              className="h-11 flex-none px-4"
              variant={a.status === "APPROVED" || a.status === "SUBMITTED" ? "outline" : "default"}
              disabled={disabled}
              onClick={() => onOpen(a.id)}
            >
              {buttonLabel(a.status)}
            </Button>
          )}
        </div>
        {mine ? (
          a.status === "NOT_STARTED" && (
            <button type="button" disabled={disabled} onClick={() => onPreview(a.id)} className="mt-2 text-xs font-medium text-primary underline disabled:opacity-50">
              Look at the questions first
            </button>
          )
        ) : (
          <div className="mt-3 border-t pt-3"><ExternalContact assignmentId={a.id} recipient={a.recipient as "GUARANTOR" | "REFERENCE"} /></div>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-6">
      {attention > 0 && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <TriangleAlert className="mt-0.5 size-5 flex-none" aria-hidden="true" />
          <p className="text-sm"><b>HR asked for changes on {attention} {attention === 1 ? "form" : "forms"}.</b> They are at the top of your list.</p>
        </div>
      )}
      {groups.map((g) => {
        const s = sections(g.items);
        const pack = g.pack ? packs.find((p) => p.id === g.pack!.id) : null;
        return (
          <section key={g.key} className="space-y-3" aria-label={pack ? pack.packName : "Other forms"}>
            <div>
              <h2 className="text-lg font-semibold">{pack ? pack.packName : packs.length ? "Other forms" : "Your forms"}</h2>
              {pack && (
                <>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {pack.approvedRequired} of {pack.requiredForms} required forms approved{pack.dueDate ? ` · Due ${pack.dueDate}` : ""}
                  </p>
                  <progress className="mt-2 h-2 w-full" aria-label={`${pack.packName} required approvals`} value={pack.approvedRequired} max={Math.max(pack.requiredForms, 1)} />
                  {pack.overdue && <p role="status" className="mt-2 text-sm font-semibold text-red-700">Overdue. Please contact HR about your deadline.</p>}
                  {pack.status === "READY_FOR_APPROVAL" && <p className="mt-2 text-sm font-medium text-amber-700">All required forms approved. Waiting for HR's final approval.</p>}
                  {pack.status === "APPROVED" && <p className="mt-2 text-sm font-medium text-green-700">Pack approved by HR.</p>}
                </>
              )}
            </div>
            {s.todo.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground">To do · {s.todo.length}</h3>
                <ul className="space-y-2">{s.todo.map((a) => row(a))}</ul>
              </div>
            )}
            {s.waiting.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground">Waiting for HR · {s.waiting.length}</h3>
                <ul className="space-y-2">{s.waiting.map((a) => row(a))}</ul>
              </div>
            )}
            {s.done.length > 0 && (
              <details className="group rounded-2xl">
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-muted-foreground">Done · {s.done.length} <span className="ml-2 text-xs font-medium text-primary group-open:hidden">Show</span><span className="ml-2 hidden text-xs font-medium text-primary group-open:inline">Hide</span></summary>
                <ul className="mt-2 space-y-2">{s.done.map((a) => row(a))}</ul>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}
