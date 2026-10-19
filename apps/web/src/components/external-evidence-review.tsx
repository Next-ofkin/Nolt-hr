"use client";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";

type Submission = {
  id: string; email: string; fullName: string; submittedAt: string;
  answers: Record<string, string | boolean | null>;
  decision: string | null; reason: string | null; reviewedAt: string | null;
};
type Detail = {
  assignmentId: string; title: string; recipient: string;
  fields: { id: string; label: string }[];
  items: Submission[];
};
export function ExternalEvidenceReview({
  assignmentId, csrfToken, onChanged,
}: { assignmentId: string; csrfToken: string; onChanged: () => Promise<void> }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    const result = await fetch(`/api/v1/employees/assignments/${encodeURIComponent(assignmentId)}/external-evidence`,
      { credentials: "same-origin", cache: "no-store" });
    if (!result.ok) throw new Error(result.status === 404
      ? "This evidence is not assigned to your HR account."
      : "Unable to load submitted evidence.");
    setDetail(await result.json() as Detail);
  }
  useEffect(() => {
    setDetail(null); setError(""); setReason(""); setNotice("");
    void load().catch(e => setError(e instanceof Error ? e.message : "Unable to load evidence"));
  }, [assignmentId]);
  async function decide(id: string, decision: "APPROVED" | "CHANGES_REQUIRED") {
    if (busy) return;
    if (decision === "CHANGES_REQUIRED" && reason.trim().length < 10) {
      setError("Explain the corrections needed in at least 10 characters."); return;
    }
    if (!window.confirm(decision === "APPROVED"
      ? "Approve this guarantor evidence? The review decision is permanent."
      : "Request corrections? A new secure guarantor request will be required.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(
        `/api/v1/employees/assignments/${encodeURIComponent(assignmentId)}/external-evidence/${encodeURIComponent(id)}/decision`,
        { method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
          body: JSON.stringify({ decision, reason: decision === "CHANGES_REQUIRED" ? reason.trim() : null }),
        });
      if (!response.ok) throw new Error(response.status === 409
        ? "This evidence was already reviewed, superseded or its case closed. Reload."
        : "Unable to record this review. Check your HR permissions.");
      setNotice(decision === "APPROVED"
        ? "Evidence approved and included in pack progress."
        : "Corrections recorded. Ask the employee to send the guarantor a fresh secure request.");
      setReason("");
      await load(); await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Review failed");
    } finally { setBusy(false); }
  }
  const fieldLabels = new Map(detail?.fields.map(f => [f.id, f.label]) ?? []);
  return <section className="space-y-4" aria-label="Guarantor evidence review">
    <h3 className="text-lg font-semibold">Guarantor / reference evidence</h3>
    <p className="text-sm text-muted-foreground">Review answers sent directly by the verified recipient.
      Approvals are final. Corrections require a new link; previous submissions remain preserved.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
    {!detail && !error && <p role="status">Loading submitted evidence…</p>}
    {detail && detail.items.length === 0 && <p>No submitted evidence to review yet.</p>}
    {detail?.items.map((item, index) => <article key={item.id} className="space-y-3 rounded-lg border p-4">
      <div><p className="font-medium">{item.fullName} · {item.email}</p>
        <p className="text-xs text-muted-foreground">Submitted {new Date(item.submittedAt).toLocaleString()}</p></div>
      {Object.entries(item.answers).map(([fieldId, value]) =>
        <div key={fieldId} className="border-b pb-2">
          <p className="text-xs font-medium text-muted-foreground">{fieldLabels.get(fieldId) ?? "Response field"}</p>
          <p className="break-words text-sm">{value === null ? "Not provided" : typeof value === "boolean" ? (value ? "Yes" : "No") : value}</p>
        </div>)}
      {item.decision && <div className="space-y-1 text-sm">
        <p className="font-medium">HR decision: {item.decision.replaceAll("_"," ")}</p>
        {item.reason && <p>Corrections: {item.reason}</p>}
        {item.reviewedAt && <p className="text-xs text-muted-foreground">Reviewed {new Date(item.reviewedAt).toLocaleString()}</p>}
      </div>}
      {!item.decision && index === 0 && <div className="space-y-2">
        <label className="block text-sm font-medium">Corrections needed (required if returning)</label>
        <textarea className="w-full rounded-lg border p-3 text-sm" value={reason}
          onChange={e => setReason(e.target.value)} maxLength={1000} rows={3}
          placeholder="Tell the employee exactly what the guarantor needs to correct" />
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy} onClick={() => void decide(item.id, "APPROVED")}>Approve evidence</Button>
          <Button type="button" variant="outline" disabled={busy || reason.trim().length < 10}
            onClick={() => void decide(item.id, "CHANGES_REQUIRED")}>Request corrections</Button>
        </div>
      </div>}
    </article>)}
  </section>;
}
