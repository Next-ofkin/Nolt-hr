"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Label } from "./ui/label";

type Pack = { id: string; name: string; employmentType: string; status: string; rootPackId: string | null; versionNumber: number; items: { id: string }[] };
type Progress = { id: string; packId: string; packName: string; totalForms: number; dueDate: string | null;
  approvedAt: string | null; status: string; overdue: boolean; requiredForms: number; approvedRequired: number; readyForApproval: boolean;
  forms: { assignmentId: string; title: string; required: boolean; status: string }[] };

export function PackAssignmentPanel({ caseId, caseRevision, employmentType, csrfToken, onAssigned }: {
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

  async function assign() {
    if (!packId || busy) return;
    if (mismatch && !window.confirm(`"${selectedPack!.name}" is for ${selectedPack!.employmentType}, but this employee is listed as ${employmentType}. Assign this pack anyway?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/v1/packs/${encodeURIComponent(packId)}/assign`, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ caseId, expectedCaseRevision: caseRevision, dueDate: dueDate || null, confirmEmploymentTypeMismatch: mismatch }),
      });
      if (!response.ok) throw new Error(response.status === 409 ?
        "This case, pack or its forms have changed. Reload and try again." :
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
    if (busy || !window.confirm("Approve this pack? All required forms must already be approved.")) return;
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

  return <section className="space-y-4 rounded-xl border bg-secondary/30 p-4">
    <div><h4 className="font-semibold">Employee onboarding packs</h4>
      <p className="mt-1 text-xs text-muted-foreground">Assign all forms from a published pack to this active onboarding case.</p></div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
    <div className="grid gap-3 sm:grid-cols-2">
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
    {existing.length > 0 && <div className="space-y-3 border-t pt-3">
      <p className="text-sm font-semibold">Assigned packs</p>
      {existing.map(a=><article key={a.id} className="rounded-lg border bg-white p-3">
        <p className="font-medium">{a.packName}</p>
        <p className="mt-1 text-xs text-muted-foreground">{a.totalForms} forms · {a.approvedRequired}/{a.requiredForms} required approved · Due {a.dueDate ?? "date not set"}</p>
        <p className="mt-1 text-xs font-semibold">Pack status: {a.status.replaceAll("_"," ")}</p>
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
        {a.readyForApproval && <Button className="mt-2" size="sm" type="button" disabled={busy} onClick={()=>void approve(a.id)}>Approve completed pack</Button>}
        <ul className="mt-2 space-y-1">{a.forms.map(form=>
          <li key={form.assignmentId} className="text-xs text-muted-foreground">
            {form.title} · {form.required ? "Required" : "Optional"} · {form.status}
          </li>)}</ul>
      </article>)}
    </div>}
  </section>;
}
