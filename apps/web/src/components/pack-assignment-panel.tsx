"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

type Pack = { id: string; name: string; employmentType: string; status: string; rootPackId: string | null; versionNumber: number; items: { id: string }[] };
type Progress = { id: string; packId: string; packName: string; totalForms: number; dueDate: string | null;
  approvedAt: string | null; status: string; overdue: boolean; requiredForms: number; approvedRequired: number; readyForApproval: boolean;
  forms: { assignmentId: string; title: string; required: boolean; status: string }[] };

export function PackAssignmentPanel({ caseId, employeeId, employmentType, csrfToken, onAssigned }: {
  employeeId: string;
  caseId: string; caseRevision: number; employmentType: string; csrfToken: string;
  onAssigned: () => Promise<void>;
}) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [existing, setExisting] = useState<Progress[]>([]);
  const [packId, setPackId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [extension, setExtension] = useState<{id:string; date:string; reason:string} | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<"mismatch" | "approve" | null>(null);
  const [approvalId, setApprovalId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([
        fetch("/api/v1/packs", { credentials: "same-origin", cache: "no-store" }),
        fetch(`/api/v1/packs/cases/${encodeURIComponent(caseId)}`, { credentials: "same-origin", cache: "no-store" }),
      ]);
      if (!p.ok || !a.ok) throw new Error("Unable to load published packs and assignments.");
      setPacks(await p.json() as Pack[]);
      setExisting(await a.json() as Progress[]);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load assigned packs.");
    }
  }, [caseId]);

  useEffect(() => { void refresh(); }, [refresh]);
  // Keep a single visibility-aware refresh timer. Avoid competing React Query
  // polling and interval requests against the same case and pack endpoints.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!busy && document.visibilityState === "visible") void refresh();
    }, 60000);
    return () => window.clearInterval(timer);
  }, [refresh, busy]);

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
  const mismatch = !!selectedPack && selectedPack.employmentType.trim().toLowerCase() !== employmentType.trim().toLowerCase();

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

  async function assign(confirmedMismatch = false) {
    if (!packId || busy) return;
    if (mismatch && !confirmedMismatch) {
      setConfirmation("mismatch");
      return;
    }
    const requestedPackId = packId;
    setConfirmation(null);
    setBusy(true); setError(""); setNotice("");
    try {
      // Refresh the employee revision and published pack versions just before mutation.
      const currentRevision = await latestCaseRevision();
      const publishedResponse = await fetch("/api/v1/packs", { credentials: "same-origin", cache: "no-store" });
      if (!publishedResponse.ok) throw new Error("Unable to refresh the published packs.");
      const published = await publishedResponse.json() as Pack[];
      setPacks(published);
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
          body: JSON.stringify({ caseId, expectedCaseRevision: revision, dueDate: dueDate || null, confirmEmploymentTypeMismatch: confirmedMismatch }),
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

  return <section className="space-y-4 rounded-xl border bg-muted/20 p-4">\n    <Dialog open={confirmation !== null} onOpenChange={open => { if (!open && !busy) setConfirmation(null); }}><DialogContent><DialogHeader><DialogTitle>{confirmation === "mismatch" ? "Employment type mismatch" : "Approve onboarding pack?"}</DialogTitle><DialogDescription>{confirmation === "mismatch" ? `This pack is for ${selectedPack?.employmentType ?? "another employment type"}, but this employee is listed as ${employmentType}. Assigning it anyway will be recorded in the audit history.` : "Confirm that every required form has been approved. This action will be recorded in the audit history."}</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>Cancel</Button><Button disabled={busy} onClick={() => { if (confirmation === "mismatch") void assign(true); else if (approvalId) { const id = approvalId; setConfirmation(null); void approve(id); } }}>{confirmation === "mismatch" ? "Assign anyway" : "Approve pack"}</Button></div></DialogContent></Dialog>
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
    {mismatch && <p role="status" className="text-xs text-amber-700">
      This pack is for {selectedPack!.employmentType}; the employee's employment type is {employmentType}.
      Confirm the mismatch when assigning. The selection is recorded in the audit history.
    </p>}
    <Button type="button" disabled={!packId || busy} onClick={()=>void assign()}>
      {busy ? "Assigning…" : "Assign selected pack"}
    </Button>
    </details>
    {existing.length > 0 && <div className="space-y-3 border-t pt-3">
      <p className="text-sm font-semibold">Assigned packs</p>
      {existing.map(a=><article key={a.id} className="rounded-lg border bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{a.packName}</p><a href={`/api/v1/exports/packs/${a.id}.zip`} download className="inline-flex min-h-9 items-center rounded-md border px-3 py-1 text-xs font-medium hover:bg-muted">Download pack ZIP</a></div>
        <p className="mt-1 text-xs text-muted-foreground">{a.totalForms} forms · {a.approvedRequired}/{a.requiredForms} required approved · Due {a.dueDate ?? "date not set"}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2"><Badge variant={a.approvedAt ? "default" : "secondary"}>{a.status.replaceAll("_"," ")}</Badge><span className="text-xs text-muted-foreground">{a.approvedRequired} of {a.requiredForms} required forms approved</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${a.requiredForms ? (a.approvedRequired / a.requiredForms) * 100 : 0}%` }} /></div>
        {a.overdue && <p role="status" className="mt-1 text-xs font-bold text-red-700">Overdue — HR follow-up needed</p>}
        {!a.approvedAt && <div className="mt-2 space-y-2">
          <Button type="button" variant="outline" size="sm" disabled={busy}
            onClick={()=>setExtension({ id:a.id, date:"", reason:"" })}>Extend deadline</Button>
          {extension?.id === a.id && <div className="space-y-2 rounded-lg border p-3">
            <label className="block text-xs font-medium">New due date
              <input type="date" className="mt-1 h-10 w-full rounded-lg border px-2" value={extension.date}
                onChange={e=>setExtension(v=>v ? {...v,date:e.target.value}:v)} />
            </label>
            <label className="block text-xs font-medium">Reason for extension
              <textarea className="mt-1 w-full rounded-lg border p-2" maxLength={1000}
                value={extension.reason} onChange={e=>setExtension(v=>v ? {...v,reason:e.target.value}:v)} />
            </label>
            <div className="flex gap-2">
              <Button type="button" size="sm" disabled={busy || !extension.date || extension.reason.trim().length < 10}
                onClick={()=>void extend()}>Save extension</Button>
              <Button type="button" size="sm" variant="outline" onClick={()=>setExtension(null)}>Cancel</Button>
            </div>
          </div>}
        </div>}
        {a.readyForApproval && <Button className="mt-2" size="sm" type="button" disabled={busy} onClick={()=>{ setApprovalId(a.id); setConfirmation("approve"); }}>Approve completed pack</Button>}
        <details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-muted-foreground">View {a.forms.length} forms</summary><ul className="mt-2 space-y-1">{a.forms.map(form=>
          <li key={form.assignmentId} className="text-xs text-muted-foreground">
            {form.title} · {form.required ? "Required" : "Optional"} · {form.status === "EXTERNAL_SUBMITTED" ? "Guarantor submitted — HR follow-up" : form.status}
          </li>)}</ul></details>
      </article>)}
    </div>}
  </section>;
}
