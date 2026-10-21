"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "./ui/button";
import { EmployeeAssignmentCard, type EmployeeAssignment } from "./employee-assignment-card";
import { ChevronDown, FileStack, PackageOpen } from "lucide-react";
import { splitAssignmentsByPack } from "@/lib/split-assignments-by-pack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth-provider";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

type Pack = { id: string; name: string; employmentType: string; status: string; rootPackId: string | null; versionNumber: number; items: { id: string }[] };
type Progress = { id: string; packId: string; packName: string; totalForms: number; dueDate: string | null;
  approvedAt: string | null; status: string; overdue: boolean; requiredForms: number; approvedRequired: number; readyForApproval: boolean;
  forms: { assignmentId: string; title: string; required: boolean; status: string }[] };

export function PackAssignmentPanel({
  caseId, employeeId, employmentType, csrfToken, onAssigned,
  assignments, onReviewForm, onReviewExternal,
}: {
  employeeId: string;
  caseId: string; caseRevision: number; employmentType: string; csrfToken: string;
  onAssigned: () => Promise<void>;
  assignments: EmployeeAssignment[];
  onReviewForm: (id: string) => void;
  onReviewExternal: (id: string) => void;
}) {
  const { session } = useAuth();
  const cache = useQueryClient();
  const [packId, setPackId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [extension, setExtension] = useState<{id:string; date:string; reason:string} | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<"approve" | null>(null);
  const [approvalId, setApprovalId] = useState<string | null>(null);

  const libraryKey = ["hr-pack-library", session?.id];
  const libraryQuery = useQuery({
    queryKey: libraryKey,
    enabled: Boolean(session),
    queryFn: async () => {
      const r = await fetch("/api/v1/packs", { credentials: "same-origin", cache: "no-store" });
      if (!r.ok) throw new Error("Unable to load published packs.");
      return await r.json() as Pack[];
    },
  });
  const progressQuery = useQuery({
    queryKey: ["hr-case-packs", caseId],
    queryFn: async () => {
      const r = await fetch(`/api/v1/packs/cases/${encodeURIComponent(caseId)}`, { credentials: "same-origin", cache: "no-store" });
      if (!r.ok) throw new Error("Unable to load assigned packs.");
      return await r.json() as Progress[];
    },
  });
  const packs = libraryQuery.data ?? [];
  const existing = progressQuery.data ?? [];
  const progressLoaded = progressQuery.isSuccess;
  const { refetch: refetchLibrary } = libraryQuery;
  const { refetch: refetchProgress } = progressQuery;
  const refresh = useCallback(async () => {
    await Promise.all([refetchLibrary(), refetchProgress()]);
  }, [refetchLibrary, refetchProgress]);
  const loadError = (progressQuery.error ?? libraryQuery.error) as Error | null;
  useEffect(() => {
    if (loadError && !progressQuery.data) setError(loadError.message);
    else if (!loadError) setError(current => current === "Unable to load assigned packs." || current === "Unable to load published packs." ? "" : current);
  }, [loadError, progressQuery.data]);

  const latestPublished = new Map<string, Pack>();
  for (const pack of packs) {
    if (pack.status !== "PUBLISHED") continue;
    const root = pack.rootPackId ?? pack.id;
    const previous = latestPublished.get(root);
    if (!previous || pack.versionNumber > previous.versionNumber)
      latestPublished.set(root, pack);
  }
  const options = [...latestPublished.values()].filter(pack =>
    pack.items.length > 0 && !existing.some(assigned => assigned.packId === pack.id),
  ).sort((a,b) => {
    const aMatch = a.employmentType.trim().toLowerCase() === employmentType.trim().toLowerCase();
    const bMatch = b.employmentType.trim().toLowerCase() === employmentType.trim().toLowerCase();
    return Number(bMatch) - Number(aMatch) || a.name.localeCompare(b.name);
  });
  const selectedPack = options.find(pack => pack.id === packId);

  async function latestCaseRevision(): Promise<number> {
    const response = await fetch(`/api/v1/employees/${encodeURIComponent(employeeId)}`, {
      credentials: "same-origin", cache: "no-store",
    });
    if (!response.ok) throw new Error("Unable to refresh the employee's onboarding case.");
    const detail = await response.json() as { onboardingCase: { id: string; revision: number; status: string } | null };
    if (!detail.onboardingCase || detail.onboardingCase.id !== caseId || detail.onboardingCase.status !== "ACTIVE")
      throw new Error("This onboarding case is no longer active. Reload the employee.");
    return detail.onboardingCase.revision;
  }

  async function assign() {
    if (!packId || busy) return;
    const requestedPackId = packId;
    setConfirmation(null);
    setBusy(true); setError(""); setNotice("");
    try {
      // Refresh the employee revision and published pack versions just before mutation.
      const currentRevision = await latestCaseRevision();
      const publishedResponse = await fetch("/api/v1/packs", { credentials: "same-origin", cache: "no-store" });
      if (!publishedResponse.ok) throw new Error("Unable to refresh the published packs.");
      const published = await publishedResponse.json() as Pack[];
      cache.setQueryData(libraryKey, published);
      const chosen = published.find(p => p.id === requestedPackId && p.status === "PUBLISHED");
      const newer = chosen && published.some(p =>
        p.status === "PUBLISHED" &&
        (p.rootPackId ?? p.id) === (chosen.rootPackId ?? chosen.id) &&
        p.versionNumber > chosen.versionNumber);
      if (!chosen || newer) {
        setPackId("");
        throw new Error("A newer pack version is available. Select the latest published pack and try again.");
      }
      let response: Response | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const revision = attempt === 0 ? currentRevision : await latestCaseRevision();
        response = await fetch(`/api/v1/packs/${encodeURIComponent(requestedPackId)}/assign`, {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
          body: JSON.stringify({ caseId, expectedCaseRevision: revision, dueDate: dueDate || null }),
        });
        if (response.status !== 409) break;
        // A 409 can also mean an already-assigned form or a changed pack.
        // Refresh once and only retry if no pack assignment is now recorded.
        await refresh();
        const check = await fetch(`/api/v1/packs/cases/${encodeURIComponent(caseId)}`, { credentials: "same-origin", cache: "no-store" });
        if (!check.ok) break;
        const current = await check.json() as Progress[];
        if (current.some(p => p.packId === requestedPackId)) break;
      }
      if (!response?.ok) throw new Error(response?.status === 409 ?
        "This pack or its forms changed, or some forms are already assigned. The latest data has been loaded; please review and try again." :
        "Could not assign the selected pack.");
      setPackId(""); setDueDate("");
      await onAssigned();
      await refresh();
      setNotice("Pack assigned. Its forms are now part of this employee's onboarding checklist.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not assign pack.");
    } finally { setBusy(false); }
  }

  async function extend() {
    if (!extension || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/v1/packs/assignments/${encodeURIComponent(extension.id)}/extend-deadline`, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ newDueDate: extension.date, reason: extension.reason }),
      });
      if (!response.ok) throw new Error(response.status === 409 ?
        "The deadline must move forward, and the onboarding case must still be active." :
        "Unable to extend deadline. Choose a future date and give a reason.");
      setExtension(null);
      await onAssigned();
      await refresh();
      setNotice("Deadline extended and recorded in the audit history.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Extension failed."); }
    finally { setBusy(false); }
  }

  async function approve(id: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/v1/packs/assignments/${encodeURIComponent(id)}/approve`, {
        method: "POST", credentials: "same-origin", headers: { "x-csrf-token": csrfToken },
      });
      if (!response.ok) throw new Error(response.status === 409 ?
        "Required forms are not all approved, or the pack has already been approved." :
        "Unable to approve this pack.");
      await refresh();
      setNotice("Pack approved. An audit event has been recorded.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to approve this pack.");
    } finally { setBusy(false); }
  }

  const { assignmentsById: assignmentMap, standalone: standaloneForms } = splitAssignmentsByPack(assignments, existing);

  return <section className="space-y-4 rounded-xl border bg-muted/20 p-4 sm:p-5">
    <Dialog open={confirmation !== null} onOpenChange={open => { if (!open && !busy) setConfirmation(null); }}><DialogContent><DialogHeader><DialogTitle>Approve onboarding pack?</DialogTitle><DialogDescription>{"Confirm that every required form has been approved. This action will be recorded in the audit history."}</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>Cancel</Button><Button disabled={busy} onClick={() => { if (approvalId) { const id = approvalId; setConfirmation(null); void approve(id); } }}>Approve pack</Button></div></DialogContent></Dialog>
    <div><h4 className="font-semibold">Employee onboarding packs</h4>
      <p className="mt-1 text-xs text-muted-foreground">Assign all forms from a published pack to this active onboarding case.</p></div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
    <details className="rounded-lg border bg-background p-3"><summary className="cursor-pointer text-sm font-medium">Assign a new onboarding pack</summary>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <div className="space-y-1"><Label htmlFor="case-pack">Published pack</Label>
        <select id="case-pack" className="native-select w-full" value={packId} onChange={e=>setPackId(e.target.value)}>
          <option value="">Choose a published pack…</option>
          {options.map(pack=><option value={pack.id} key={pack.id}>{pack.name} · v{pack.versionNumber} · {pack.employmentType} ({pack.items.length} forms)</option>)}
        </select>
      </div>
      <div className="space-y-1"><Label htmlFor="case-pack-due">Due date (optional)</Label>
        <input className="h-10 w-full rounded-lg border bg-white px-3 text-sm" id="case-pack-due" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/>
      </div>
    </div>
    {options.length === 0 && !error && <p className="text-xs text-muted-foreground">
      No available published packs. Publish a pack with forms in the Packs workspace; already assigned pack versions are hidden.
    </p>}
    <Button type="button" disabled={!packId || busy} onClick={()=>void assign()}>
      {busy ? "Assigning…" : "Assign selected pack"}
    </Button>
    </details>
    {!progressLoaded && !error && (
      <p role="status" className="rounded-lg border bg-white px-4 py-3 text-sm text-muted-foreground">
        Loading assigned packs and forms…
      </p>
    )}
    {!progressLoaded && error && <Button type="button" variant="outline" onClick={() => void refresh()}>Retry loading assigned packs</Button>}
    {progressLoaded && (
      <div className="space-y-4 border-t pt-4">
        <div>
          <h4 className="text-sm font-semibold">Assigned onboarding packs</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Open a pack to view its forms, review submissions and download documents.
          </p>
        </div>
        {existing.length === 0 && (
          <p className="rounded-xl border border-dashed bg-white p-4 text-sm text-muted-foreground">
            No onboarding packs assigned yet. Use “Assign a new onboarding pack” above.
          </p>
        )}
        {existing.map(pack => (
          <details key={pack.id} className="group min-w-0 overflow-hidden rounded-xl border bg-white shadow-sm">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 marker:hidden sm:px-5 [&::-webkit-details-marker]:hidden">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                <PackageOpen size={20} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words font-semibold">{pack.packName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {pack.totalForms} forms · {pack.approvedRequired}/{pack.requiredForms} required approved
                  {pack.dueDate ? ` · Due ${pack.dueDate}` : ""}
                </p>
              </div>
              <Badge className="hidden sm:inline-flex" variant={pack.approvedAt ? "default" : "secondary"}>
                {pack.status.replaceAll("_"," ")}
              </Badge>
              <ChevronDown size={18} className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="space-y-4 border-t bg-slate-50/60 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant={pack.approvedAt ? "default" : "secondary"}>{pack.status.replaceAll("_"," ")}</Badge>
                  <span className="text-muted-foreground">{pack.approvedRequired} of {pack.requiredForms} required forms approved</span>
                </div>
                <a href={`/api/v1/exports/packs/${pack.id}.zip`} download
                  className="inline-flex min-h-9 items-center rounded-md border bg-white px-3 py-1.5 text-xs font-medium hover:bg-accent">
                  Download pack ZIP
                </a>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar"
                aria-valuemin={0} aria-valuemax={pack.requiredForms} aria-valuenow={pack.approvedRequired}
                aria-label={`${pack.packName} required forms approved`}>
                <div className="h-full rounded-full bg-primary"
                  style={{width: `${pack.requiredForms ? pack.approvedRequired / pack.requiredForms * 100 : 0}%`}} />
              </div>
              {pack.overdue && <p role="status" className="text-xs font-semibold text-red-700">Overdue — HR follow-up needed</p>}
              {!pack.approvedAt && (
                <div className="space-y-2">
                  <Button type="button" variant="outline" size="sm" disabled={busy}
                    onClick={() => setExtension({id:pack.id,date:"",reason:""})}>Extend deadline</Button>
                  {extension?.id === pack.id && (
                    <div className="grid gap-3 rounded-lg border bg-white p-3">
                      <label className="text-xs font-medium">New due date
                        <input type="date" className="mt-1 h-10 w-full rounded-lg border px-2"
                          value={extension.date} onChange={e => setExtension(v => v ? {...v,date:e.target.value} : v)} />
                      </label>
                      <label className="text-xs font-medium">Reason for extension
                        <textarea className="mt-1 w-full rounded-lg border p-2" maxLength={1000}
                          value={extension.reason} onChange={e => setExtension(v => v ? {...v,reason:e.target.value} : v)} />
                      </label>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" disabled={busy || !extension.date || extension.reason.trim().length < 10}
                          onClick={() => void extend()}>Save extension</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setExtension(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {pack.readyForApproval && (
                <Button type="button" disabled={busy}
                  onClick={() => {setApprovalId(pack.id);setConfirmation("approve");}}>
                  Approve completed pack
                </Button>
              )}
              <div>
                <h5 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <FileStack size={17} className="text-primary" aria-hidden="true" />
                  Forms in this pack ({pack.forms.length})
                </h5>
                <ul className="space-y-2">
                  {pack.forms.map(form => {
                    const assignment = assignmentMap.get(form.assignmentId);
                    return assignment ? (
                      <EmployeeAssignmentCard key={form.assignmentId} assignment={assignment}
                        onReview={onReviewForm} onExternalReview={onReviewExternal} />
                    ) : (
                      <li key={form.assignmentId} className="rounded-lg border bg-white p-3 text-sm">
                        {form.title} · {form.status.replaceAll("_", " ")}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </details>
        ))}
        {standaloneForms.length > 0 && (
          <section className="rounded-xl border bg-white p-4 sm:p-5" aria-label="Forms outside onboarding packs">
            <h4 className="font-semibold">Other assigned forms</h4>
            <p className="mt-1 text-xs text-muted-foreground">Individual forms that are not part of an assigned onboarding pack.</p>
            <ul className="mt-4 space-y-2">
              {standaloneForms.map(assignment => (
                <EmployeeAssignmentCard key={assignment.id} assignment={assignment}
                  onReview={onReviewForm} onExternalReview={onReviewExternal} />
              ))}
            </ul>
          </section>
        )}
      </div>
    )}
  </section>;
}
