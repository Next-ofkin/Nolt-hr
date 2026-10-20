"use client";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { ClipboardCheck, Clock3, Loader2, UserPlus, XCircle } from "lucide-react";
import { useAuth } from "./auth-provider";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

type Draft = { id: string; name: string; email: string; state: string; createdAt: string; revokedAt: string | null };
const endpoint = "/api/v1/developer/hr-invitation-drafts";
export function HrInvitationDrafts() {
  const { session } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sendAvailable, setSendAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmSendId, setConfirmSendId] = useState<string | null>(null);
  const draftsQuery = useQuery({
    queryKey: ["hr-invitation-drafts", session?.id],
    enabled: Boolean(session),
    queryFn: async () => {
      const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Could not load HR invitation drafts.");
      return ((await response.json()) as { items: Draft[] }).items;
    },
  });
  const items = draftsQuery.data ?? [];
  const loading = draftsQuery.isLoading;
  const { refetch: refetchDrafts } = draftsQuery;
  const load = useCallback(async () => { await refetchDrafts(); }, [refetchDrafts]);
  useEffect(() => {
    if (draftsQuery.error && !draftsQuery.data) setError(draftsQuery.error.message);
  }, [draftsQuery.error, draftsQuery.data]);
  // Server-driven delivery jobs finish asynchronously. Refresh visible dashboards
  // without full-page reloads, and fetch immediately when the tab regains focus.
  useEffect(() => {
    let active = true;
    void fetch("/api/v1/developer/overview", { credentials: "same-origin", cache: "no-store" })
      .then(async response => {
        if (!response.ok) return;
        const data: { inviteEnabled?: boolean } = await response.json();
        if (active) setSendAvailable(data.inviteEnabled === true);
      })
      .catch(() => { if (active) setSendAvailable(false); });
    return () => { active = false; };
  }, []);
  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || busy || !sendAvailable) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "x-csrf-token": session.csrfToken },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase() }),
      });
      if (!response.ok) throw new Error(response.status === 409 ? "This email already has an account or active invitation draft." : "Could not prepare this invitation. Check the details and try again.");
      const draft: Draft = await response.json();
      // Queue the just-created draft as part of the same user action. If queue
      // fails, retain the saved draft for retry; never claim an email was sent.
      const queued = await fetch(`${endpoint}/${encodeURIComponent(draft.id)}/queue`, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "x-csrf-token": session.csrfToken },
        body: JSON.stringify({ requestKey: crypto.randomUUID() }),
      });
      setName(""); setEmail("");
      if (!queued.ok) {
        setError("The invitation was saved but could not be queued. Use Send invitation email under Recent invitations to retry.");
      } else {
        setNotice("HR invitation queued for email delivery. The recipient will receive HR access automatically after verifying their email, password and MFA.");
      }
      await load();
    } catch(e) { setError(e instanceof Error ? e.message : "Could not save draft."); }
    finally { setBusy(false); }
  }
  async function sendInvitation(id: string) {
    if (!session || busy || !sendAvailable) return;
    setConfirmSendId(null);
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(id)}/queue`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "x-csrf-token": session.csrfToken },
        body: JSON.stringify({ requestKey: crypto.randomUUID() }),
      });
      if (!response.ok) {
        throw new Error(response.status === 503
          ? "HR invitation delivery is unavailable. Refresh and try again."
          : response.status === 409
            ? "This invitation cannot be queued. Check the recipient and current status."
            : "Could not queue this invitation. No delivery is confirmed.");
      }
      setNotice("Invitation queued. HR access activates automatically after email, password and MFA verification.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not queue the invitation."); }
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
    <section className="rounded-2xl border border-border bg-accent/60 p-6">
      <Dialog open={confirmSendId !== null} onOpenChange={open => { if (!open) setConfirmSendId(null); }}><DialogContent><DialogHeader><DialogTitle>Send HR invitation?</DialogTitle><DialogDescription>HR access will only be granted once the recipient completes email, password and MFA verification.</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirmSendId(null)}>Cancel</Button><Button disabled={busy} onClick={() => { const id = confirmSendId; if (id) void sendInvitation(id); }}>Send email</Button></div></DialogContent></Dialog>
      <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-primary"><UserPlus size={22}/></span>
      <h2 className="mt-5 text-xl font-semibold tracking-tight">Prepare an HR invitation</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Invite a new HR colleague in one step. We will email their invitation; HR access activates automatically after they verify their email, set their password and complete MFA.</p>
      <form onSubmit={e=>void prepare(e)} className="mt-5 space-y-3">
        <label className="block text-xs font-semibold text-accent-foreground">Full name<input value={name} onChange={e=>setName(e.target.value)} maxLength={160} minLength={2} required autoComplete="off" placeholder="e.g. Alex Morgan" className="mt-1.5 h-10 w-full rounded-xl border bg-white px-3 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"/></label>
        <label className="block text-xs font-semibold text-accent-foreground">Work email<input value={email} onChange={e=>setEmail(e.target.value)} type="email" maxLength={254} required autoComplete="off" placeholder="alex@company.com" className="mt-1.5 h-10 w-full rounded-xl border bg-white px-3 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"/></label>
        <Button type="submit" className="w-full rounded-xl" disabled={busy || !session || !sendAvailable}>{busy ? <Loader2 className="animate-spin"/> : <ClipboardCheck/>} Send HR invitation</Button>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="mt-3 text-sm text-primary">{notice}</p>}
      <div className="mt-5 border-t border-border pt-4">
        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Recent invitations</h3><span className="text-xs text-muted-foreground">Latest 25</span></div>
        {loading ? <p role="status" className="mt-3 text-xs text-muted-foreground">Loading drafts…</p> : items.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">No drafts created yet.</p> : <div className="mt-3 space-y-2">{items.map(item=><div key={item.id} className="rounded-xl border border-[#dbe9e4] bg-white px-3 py-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs font-semibold">{item.name}</p><p className="truncate text-xs text-muted-foreground">{item.email}</p></div><span className="shrink-0 text-[11px] font-semibold text-muted-foreground">{item.state === "DRAFT" ? "Draft" : item.state.toLowerCase().replaceAll("_", " ")}</span></div>{item.state === "DRAFT" && sendAvailable && <button type="button" disabled={busy} className="mt-2 mr-4 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:opacity-50" onClick={() => setConfirmSendId(item.id)}><UserPlus size={13}/> Send invitation email</button>}{item.state === "DRAFT" && <button type="button" disabled={busy} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline disabled:opacity-50" onClick={()=>void revoke(item.id)}><XCircle size={13}/> Revoke draft</button>}</div>)}</div>}
      </div>
      <div className="mt-5 flex items-center gap-2 rounded-xl border border-border bg-white/70 px-3 py-3 text-xs font-medium text-accent-foreground"><Clock3 size={16}/> {sendAvailable ? "Invitations can be emailed to eligible new users. HR access activates automatically after verified registration and MFA." : "HR email delivery is currently unavailable. Please refresh or contact the administrator if the service remains unavailable."}</div>
    </section>
  );
}
