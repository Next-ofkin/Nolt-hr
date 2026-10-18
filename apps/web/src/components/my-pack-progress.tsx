"use client";
import { useCallback, useEffect, useState } from "react";

type PackProgress = {
  id: string; packName: string; dueDate: string | null; status: string; overdue: boolean;
  requiredForms: number; approvedRequired: number; totalForms: number;
  forms: { assignmentId: string; title: string; required: boolean; status: string }[];
};

export function MyPackProgress({ refreshKey }: { refreshKey: number }) {
  const [packs, setPacks] = useState<PackProgress[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/me/packs", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Your pack progress is temporarily unavailable.");
      setPacks(await response.json() as PackProgress[]);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load packs.");
    }
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);
  if (error) return <p role="alert" className="rounded-lg border p-4 text-sm">{error}</p>;
  if (!packs.length) return null;
  return <section className="space-y-3" aria-label="Onboarding pack progress">
    <h2 className="text-xl font-semibold">My onboarding packs</h2>
    {packs.map(pack => <article key={pack.id} className="rounded-xl border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{pack.packName}</h3>
        <span className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold">{pack.status.replaceAll("_", " ")}</span>
      </div>
      {pack.overdue && <p role="status" className="mt-2 text-sm font-semibold text-red-700">Overdue — please contact HR about your deadline.</p>}
      <p className="mt-2 text-sm text-muted-foreground">
        {pack.approvedRequired} of {pack.requiredForms} required forms approved
        {pack.dueDate ? ` · Due ${pack.dueDate}` : ""}
      </p>
      <progress className="mt-3 h-2 w-full" aria-label={`${pack.packName} required approvals`}
        value={pack.approvedRequired} max={Math.max(pack.requiredForms, 1)} />
      <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
        {pack.forms.map(form => <li key={form.assignmentId}>{form.title} · {form.required ? "Required" : "Optional"} · {form.status.replaceAll("_", " ")}</li>)}
      </ul>
      {pack.status === "READY_FOR_APPROVAL" && <p className="mt-3 text-sm font-medium text-amber-700">Required forms approved. Awaiting final HR pack approval.</p>}
      {pack.status === "APPROVED" && <p className="mt-3 text-sm font-medium text-green-700">Pack approved by HR.</p>}
    </article>)}
  </section>;
}
