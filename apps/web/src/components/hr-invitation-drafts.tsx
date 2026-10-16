"use client";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ClipboardCheck, Clock3, Loader2, UserPlus, XCircle } from "lucide-react";
import { useAuth } from "./auth-provider";
import { Button } from "./ui/button";

type Draft = { id: string; name: string; email: string; state: string; createdAt: string; revokedAt: string | null };
const endpoint = "/api/v1/developer/hr-invitation-drafts";
export function HrInvitationDrafts() {
  const { session } = useAuth();
  const [items, setItems] = useState<Draft[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Could not load HR invitation drafts.");
      const value: {items: Draft[]} = await response.json();
      setItems(value.items);
    } catch(e) { setError(e instanceof Error ? e.message : "Could not load drafts."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "x-csrf-token": session.csrfToken },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase() }),
      });
      if (!response.ok) throw new Error(response.status === 409 ? "This email already has an account or active invitation draft." : "Could not prepare this invitation. Check the details and try again.");
      setName(""); setEmail("");
      setNotice("HR invitation draft saved. No email has been sent and no permissions were granted.");
      await load();
    } catch(e) { setError(e instanceof Error ? e.message : "Could not save draft."); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    if (!session || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(id)}/revoke`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "x-csrf-token": session.csrfToken },
      });
      if (!response.ok) throw new Error("Could not revoke this draft.");
      setNotice("Draft revoked. No account was changed.");
      await load();
    } catch(e) { setError(e instanceof Error ? e.message : "Could not revoke draft."); }
    finally { setBusy(false); }
  }
  return (
    <section className="rounded-2xl border border-[#dbe9e4] bg-[#eff8f3] p-6">
      <span className="flex size-11 items-center justify-center rounded-xl bg-[#dcefe5] text-[#146f56]"><UserPlus size={22}/></span>
      <h2 className="mt-5 text-xl font-semibold tracking-tight">Prepare an HR invitation</h2>
      <p className="mt-2 text-sm leading-6 text-[#526a62]">Save and manage invitation drafts securely. Email delivery and role activation are not enabled yet: no invite will be sent from this form.</p>
      <form onSubmit={e=>void prepare(e)} className="mt-5 space-y-3">
        <label className="block text-xs font-semibold text-[#315d52]">Full name<input value={name} onChange={e=>setName(e.target.value)} maxLength={160} minLength={2} required autoComplete="off" placeholder="e.g. Alex Morgan" className="mt-1.5 h-10 w-full rounded-xl border bg-white px-3 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"/></label>
        <label className="block text-xs font-semibold text-[#315d52]">Work email<input value={email} onChange={e=>setEmail(e.target.value)} type="email" maxLength={254} required autoComplete="off" placeholder="alex@company.com" className="mt-1.5 h-10 w-full rounded-xl border bg-white px-3 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"/></label>
        <Button type="submit" className="w-full rounded-xl" disabled={busy || !session}>{busy ? <Loader2 className="animate-spin"/> : <ClipboardCheck/>} Save invitation draft</Button>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="mt-3 text-sm text-[#146f56]">{notice}</p>}
      <div className="mt-5 border-t border-[#d1e5da] pt-4">
        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Recent drafts</h3><span className="text-xs text-[#526a62]">Latest 25</span></div>
        {loading ? <p role="status" className="mt-3 text-xs text-muted-foreground">Loading drafts…</p> : items.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">No drafts created yet.</p> : <div className="mt-3 space-y-2">{items.map(item=><div key={item.id} className="rounded-xl border border-[#dbe9e4] bg-white px-3 py-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs font-semibold">{item.name}</p><p className="truncate text-xs text-muted-foreground">{item.email}</p></div><span className="shrink-0 text-[11px] font-semibold text-[#526a62]">{item.state === "DRAFT" ? "Draft" : "Revoked"}</span></div>{item.state === "DRAFT" && <button type="button" disabled={busy} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline disabled:opacity-50" onClick={()=>void revoke(item.id)}><XCircle size={13}/> Revoke draft</button>}</div>)}</div>}
      </div>
      <div className="mt-5 flex items-center gap-2 rounded-xl border border-[#cae2d7] bg-white/70 px-3 py-3 text-xs font-medium text-[#276450]"><Clock3 size={16}/> Sending and MFA-verified acceptance: next phase</div>
    </section>
  );
}
