"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@nolt/api-client";
import type { components } from "@nolt/api-client/schema";
import { useAuth } from "./auth-provider";
import { Button } from "./ui/button";
export function ExternalRequests({
  assignmentId,
  contactRevision,
  contactDirty,
  onRequestStatus,
}: {
  assignmentId: string;
  contactRevision: number;
  contactDirty: boolean;
  onRequestStatus: (hasRequest: boolean, latestState: string | null) => void;
}) {
  const { session } = useAuth();
  const [items, setItems] = useState<
      components["schemas"]["ExternalRequestDto"][]
    >([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const pending = useRef<{
    requestKey: string;
    expectedContactRevision: number;
    replaceRequestId?: string;
  } | null>(null);
  const load = useCallback(async (silent = false) => {
    if (!silent) { setBusy(true); setError(""); }
    try {
      const r = await api.GET("/api/v1/me/assignments/{id}/external-requests", {
        params: { path: { id: assignmentId } },
      });
      if (r.error) throw Error(errorMessage(r.error));
      setItems(r.data.items);
      onRequestStatus(r.data.items.length > 0, r.data.items[0]?.state ?? null);
    } catch (e) {
      if (!silent) setError(
        e instanceof Error ? e.message : "Could not load request status.",
      );
    } finally {
      if (!silent) setBusy(false);
    }
  }, [assignmentId, onRequestStatus]);
  useEffect(() => {
    void load();
  }, [load]);
  // Keep requests and delivery history up-to-date without manual refresh.
  // Background reads never block editing or show an intrusive spinner.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") void load(true); };
    const interval = window.setInterval(refresh, 8000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  const active = items[0];
  const canSendFresh = !active || ["REVOKED", "EXPIRED", "FAILED", "CHANGES_REQUIRED"].includes(active.state);
  const canReplace = !!active && ["SENT", "QUEUED", "SENDING", "UNCERTAIN", "ACTIVE"].includes(active.state);
  async function send(replace?: string) {
    if (!session) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (
        !pending.current ||
        pending.current.expectedContactRevision !== contactRevision ||
        pending.current.replaceRequestId !== replace
      )
        pending.current = {
          requestKey: crypto.randomUUID(),
          expectedContactRevision: contactRevision,
          ...(replace ? { replaceRequestId: replace } : {}),
        };
      const r = await api.POST(
        "/api/v1/me/assignments/{id}/external-requests",
        {
          params: { path: { id: assignmentId } },
          headers: { "x-csrf-token": session.csrfToken },
          body: pending.current,
        },
      );
      if (r.error) throw Error(errorMessage(r.error));
      pending.current = null;
      setNotice("Request queued. Email delivery status updates automatically.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not queue the request.");
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    if (!session) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api.POST(
        "/api/v1/me/assignments/{id}/external-requests/{requestId}/revoke",
        {
          params: { path: { id: assignmentId, requestId: id } },
          headers: { "x-csrf-token": session.csrfToken },
        },
      );
      if (r.error) throw Error(errorMessage(r.error));
      setNotice(
        "Request revoked. Its previous link and recipient session no longer work.",
      );
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not revoke the request.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="space-y-3 border-t pt-3"
      aria-label="External request status"
    >
      <p className="text-sm">
        Your recipient receives their own verification link and submits directly
        to HR. You can track status here.
      </p>
      {contactDirty && (
        <p className="text-sm">Save recipient changes before sending.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {canSendFresh && (
          <Button
            type="button"
            disabled={busy || !contactRevision || contactDirty}
            onClick={() => void send()}
          >
            {active?.state === "CHANGES_REQUIRED" ? "Send corrected guarantor request" : "Send request"}
          </Button>
        )}
        {canReplace && active && (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy || contactDirty}
              onClick={() => void send(active.id)}
            >
              Replace request and send new link
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void revoke(active.id)}
            >
              Revoke request
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void load()}
        >
          Check now
        </Button>
      </div>
      {error && (
        <p role="alert" className="break-words text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {!items.length && <p className="text-sm">Request status: Not sent</p>}
      {active?.state === "CHANGES_REQUIRED" && <p role="status" className="text-sm text-amber-700">HR requested corrections. Review the reason below, then send your guarantor a new secure request. The original evidence is preserved.</p>}
      {active?.state === "APPROVED" && <p role="status" className="text-sm text-green-700">Guarantor evidence approved by HR.</p>}
      {active?.state === "SUBMITTED" && <p role="status" className="text-sm">Guarantor submitted the form. Awaiting HR review.</p>}
      <p className="text-xs text-muted-foreground">Request history updates automatically every 8 seconds while this page is open.</p>
      <ul className="space-y-2">
        {items.map((i) => (
          <li className="break-words rounded-md border p-3 text-sm" key={i.id}>
            {i.email} — {i.state.toLowerCase().replaceAll("_", " ")}
            <br />
            Link expires: {new Date(i.expiresAt).toLocaleString()}
            {(i as typeof i & { correctionReason?: string | null }).correctionReason && <p className="mt-1 text-sm text-amber-700">HR corrections: {(i as typeof i & { correctionReason?: string | null }).correctionReason}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
