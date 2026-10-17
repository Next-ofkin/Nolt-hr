"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Label } from "./ui/label";

type Pack = { id: string; name: string; employmentType: string; status: string; items: { id: string }[] };
type Progress = { id: string; packName: string; totalForms: number; dueDate: string | null;
  forms: { assignmentId: string; title: string; required: boolean; status: string }[] };

export function PackAssignmentPanel({ caseId, caseRevision, employmentType, csrfToken, onAssigned }: {
  caseId: string; caseRevision: number; employmentType: string; csrfToken: string;
  onAssigned: () => Promise<void>;
}) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [existing, setExisting] = useState<Progress[]>([]);
  const [packId, setPackId] = useState("");
  const [dueDate, setDueDate] = useState("");
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

  const options = packs.filter(pack =>
    pack.status === "PUBLISHED" && pack.items.length > 0 &&
    pack.employmentType.trim().toLowerCase() === employmentType.trim().toLowerCase() &&
    !existing.some(assigned => assigned.id === pack.id),
  );

  async function assign() {
    if (!packId || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/v1/packs/${encodeURIComponent(packId)}/assign`, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ caseId, expectedCaseRevision: caseRevision, dueDate: dueDate || null }),
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

  return <section className="space-y-4 rounded-xl border bg-secondary/30 p-4">
    <div><h4 className="font-semibold">Employee onboarding packs</h4>
      <p className="mt-1 text-xs text-muted-foreground">Assign all forms from a published pack to this active onboarding case.</p></div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1"><Label htmlFor="case-pack">Published pack</Label>
        <select id="case-pack" className="native-select w-full" value={packId} onChange={e=>setPackId(e.target.value)}>
          <option value="">Choose matching pack…</option>
          {options.map(pack=><option value={pack.id} key={pack.id}>{pack.name} ({pack.items.length} forms)</option>)}
        </select>
      </div>
      <div className="space-y-1"><Label htmlFor="case-pack-due">Due date (optional)</Label>
        <input className="h-10 w-full rounded-lg border bg-white px-3 text-sm" id="case-pack-due" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/>
      </div>
    </div>
    <Button type="button" disabled={!packId || busy} onClick={()=>void assign()}>
      {busy ? "Assigning…" : "Assign selected pack"}
    </Button>
    {existing.length > 0 && <div className="space-y-3 border-t pt-3">
      <p className="text-sm font-semibold">Assigned packs</p>
      {existing.map(a=><article key={a.id} className="rounded-lg border bg-white p-3">
        <p className="font-medium">{a.packName}</p>
        <p className="mt-1 text-xs text-muted-foreground">{a.totalForms} forms · Due {a.dueDate ?? "date not set"}</p>
        <ul className="mt-2 space-y-1">{a.forms.map(form=>
          <li key={form.assignmentId} className="text-xs text-muted-foreground">
            {form.title} · {form.required ? "Required" : "Optional"} · {form.status}
          </li>)}</ul>
      </article>)}
    </div>}
  </section>;
}
