"use client";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, Mail, MessageCircle, TriangleAlert } from "lucide-react";
import { api, errorMessage } from "@nolt/api-client";
import { useAuth } from "./auth-provider";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { headsUpMessage, latestForSlot, progressLabel, stillSending, viewOf, type SlotItem } from "@/lib/guarantor-slots";

/** One card per guarantor. Type a name and an email, tap Send. Nothing else to save. */
export function GuarantorSlots({ assignmentId, recipient }: { assignmentId: string; recipient: string }) {
  const word = recipient === "REFERENCE" ? "referee" : "guarantor";
  const Word = word[0]!.toUpperCase() + word.slice(1);
  const query = useQuery({
    queryKey: ["external-requests", assignmentId],
    queryFn: async () => {
      const r = await api.GET("/api/v1/me/assignments/{id}/external-requests", {
        params: { path: { id: assignmentId } },
      });
      if (r.error) throw Error(errorMessage(r.error));
      return r.data;
    },
    refetchInterval: (q) => (q.state.data && stillSending(q.state.data.items) ? 4000 : false),
  });
  if (query.isPending) return <p role="status" className="text-sm text-muted-foreground">Loading…</p>;
  if (query.error || !query.data)
    return <p role="alert" className="text-sm text-red-700">Could not load this section. Reload the page.</p>;
  const { items, required } = query.data;
  return (
    <div className="space-y-3">
      {required > 1 && (
        <p className="text-sm text-muted-foreground">HR needs <b>{required} {word}s</b> for this form. Each one gets their own email.</p>
      )}
      {Array.from({ length: required }, (_, i) => (
        <SlotCard key={i + 1} slot={i + 1} total={required} word={Word} lower={word} assignmentId={assignmentId} recipient={recipient}
          item={latestForSlot(items as SlotItem[], i + 1)} />
      ))}
    </div>
  );
}

function SlotCard({ slot, total, word, lower, assignmentId, recipient, item }: {
  slot: number; total: number; word: string; lower: string; assignmentId: string; recipient: string; item: SlotItem | undefined;
}) {
  const { session } = useAuth();
  const qc = useQueryClient();
  const view = viewOf(item);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item?.fullName ?? "");
  const [email, setEmail] = useState(item?.email ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const key = useRef<{ sig: string; id: string } | null>(null);
  const label = total > 1 ? `${word} ${slot}` : word;
  const showForm = view === "EMPTY" || view === "CHANGES_REQUIRED" || editing;

  async function send(replace: boolean, details?: { name: string; email: string }) {
    if (!session) return;
    const body = {
      slot,
      fullName: (details?.name ?? name).trim(),
      email: (details?.email ?? email).trim().toLowerCase(),
      ...(replace && item ? { replaceRequestId: item.id } : {}),
    };
    // The same tap sent twice reuses one key, so a flaky connection never emails twice.
    const sig = JSON.stringify(body);
    if (key.current?.sig !== sig) key.current = { sig, id: crypto.randomUUID() };
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api.POST("/api/v1/me/assignments/{id}/external-requests", {
        params: { path: { id: assignmentId } },
        headers: { "x-csrf-token": session.csrfToken },
        body: { ...body, requestKey: key.current.id },
      });
      if (r.error) throw Error(errorMessage(r.error));
      key.current = null;
      setEditing(false);
      setNotice("Queued. The email goes out in a moment.");
      await qc.invalidateQueries({ queryKey: ["external-requests", assignmentId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!session || !item) return;
    setBusy(true);
    setError("");
    try {
      const r = await api.POST("/api/v1/me/assignments/{id}/external-requests/{requestId}/revoke", {
        params: { path: { id: assignmentId, requestId: item.id } },
        headers: { "x-csrf-token": session.csrfToken },
      });
      if (r.error) throw Error(errorMessage(r.error));
      setNotice("Cancelled. Their link no longer works.");
      await qc.invalidateQueries({ queryKey: ["external-requests", assignmentId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel.");
    } finally {
      setBusy(false);
    }
  }

  const tone =
    view === "APPROVED" ? "border-emerald-300 bg-emerald-50"
    : view === "CHANGES_REQUIRED" ? "border-amber-300 bg-amber-50"
    : "border-[#dbe6f7] bg-white";
  const Icon = view === "APPROVED" ? CheckCircle2 : view === "CHANGES_REQUIRED" ? TriangleAlert : view === "EMPTY" ? Mail : Clock3;
  const failedBefore = item && view === "EMPTY";
  return (
    <section className={`space-y-3 rounded-2xl border p-4 ${tone}`} aria-label={label}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Icon className="size-5 flex-none text-primary" aria-hidden="true" />
        <h4 className="font-semibold">{label}</h4>
        {item && view !== "EMPTY" && <span className="ml-auto text-xs font-semibold text-muted-foreground">{progressLabel(item.state)}</span>}
      </div>

      {item && view !== "EMPTY" && !editing && (
        <p className="break-words text-sm"><b>{item.fullName}</b><br /><span className="text-muted-foreground">{item.email}</span></p>
      )}
      {failedBefore && <p className="text-sm text-amber-900">{progressLabel(item.state)}. You can send it again.</p>}
      {view === "CHANGES_REQUIRED" && item?.correctionReason && (
        <div className="rounded-xl border border-amber-300 bg-white p-3 text-sm">
          <p className="font-medium">HR feedback</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{item.correctionReason}</p>
        </div>
      )}
      {view === "WAITING_HR" && <p className="text-sm">Your {lower} sent the form. HR will review it.</p>}
      {view === "APPROVED" && <p className="text-sm">HR approved this {lower}. Nothing more to do here.</p>}

      {showForm && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(editing);
          }}
        >
          <div className="space-y-1">
            <Label htmlFor={`g-name-${assignmentId}-${slot}`}>{word}&apos;s full name</Label>
            <Input id={`g-name-${assignmentId}-${slot}`} value={name} onChange={(e) => setName(e.target.value)}
              required maxLength={160} autoComplete="off" disabled={busy} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`g-email-${assignmentId}-${slot}`}>{word}&apos;s email</Label>
            <Input id={`g-email-${assignmentId}-${slot}`} type="email" inputMode="email" value={email}
              onChange={(e) => setEmail(e.target.value)} required maxLength={254} autoComplete="off" disabled={busy} />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="h-12 flex-1 text-[15px]" disabled={busy || !name.trim() || !email.trim()}>
              {busy ? "Sending…" : editing ? `Send to the new ${lower}` : view === "CHANGES_REQUIRED" ? "Send corrected request" : failedBefore ? "Send again" : "Send"}
            </Button>
            {editing && (
              <Button type="button" variant="outline" className="h-12" disabled={busy} onClick={() => { setEditing(false); setName(item?.fullName ?? ""); setEmail(item?.email ?? ""); }}>
                Keep the current {lower}
              </Button>
            )}
          </div>
        </form>
      )}

      {view === "IN_PROGRESS" && !editing && item && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => { setName(item.fullName); setEmail(item.email); setEditing(true); }}>
            Change {lower}
          </Button>
          <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => void send(true, { name: item.fullName, email: item.email })}>
            Send a new link
          </Button>
          <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => void cancel()}>
            Cancel
          </Button>
        </div>
      )}
      {view === "IN_PROGRESS" && !editing && item && item.state !== "ACTIVE" && (
        <div className="space-y-2 rounded-xl border border-[#bcd6f7] bg-[#e6f1ff] p-3 text-sm text-[#0a3a7a]">
          <p><b>Tell {item.fullName.split(" ")[0]} to expect it.</b> People trust an email more when they hear about it first.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <a
              className="inline-flex h-11 w-full items-center sm:w-auto sm:flex-1 justify-center gap-2 rounded-xl bg-[#0b63c9] px-4 text-sm font-semibold text-white"
              target="_blank" rel="noreferrer"
              href={`https://wa.me/?text=${encodeURIComponent(headsUpMessage({ guarantorName: item.fullName, employeeName: session?.name ?? "", role: recipient, host: typeof window === "undefined" ? "" : window.location.host }))}`}
            >
              <MessageCircle className="size-4" aria-hidden="true" /> Send on WhatsApp
            </a>
            <Button type="button" variant="outline" className="h-11 w-full bg-white sm:w-auto sm:flex-1" onClick={async () => {
              try {
                await navigator.clipboard.writeText(headsUpMessage({ guarantorName: item.fullName, employeeName: session?.name ?? "", role: recipient, host: window.location.host }));
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
              } catch { /* clipboard blocked: the WhatsApp button still works */ }
            }}>
              {copied ? "Copied" : "Copy the message"}
            </Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="break-words rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
    </section>
  );
}
