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
}: {
  assignmentId: string;
  contactRevision: number;
  contactDirty: boolean;
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
    } catch (e) {
      if (!silent) setError(
        e instanceof Error ? e.message : "Could not load request status.",
      );
    } finally {
      if (!silent) setBusy(false);
    }
  }, [assignmentId]);
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
  const active = items.find(
    (i) => !["REVOKED", "EXPIRED", "FAILED"].includes(i.state),
  );
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
        {!active && (
          <Button
            type="button"
            disabled={busy || !contactRevision || contactDirty}
            onClick={() => void send()}
          >
            Send request
          </Button>
        )}
        {active && active.state !== "SUBMITTED" && (
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
      <p className="text-xs text-muted-foreground">Request history updates automatically every 8 seconds while this page is open.</p>
      <ul className="space-y-2">
        {items.map((i) => (
          <li className="break-words rounded-md border p-3 text-sm" key={i.id}>
            {i.email} — {i.state.toLowerCase().replaceAll("_", " ")}
            <br />
            Link expires: {new Date(i.expiresAt).toLocaleString()}
          </li>
        ))}
      </ul>
    </section>
  );
}
