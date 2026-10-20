"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "@nolt/api-client";
import type { components } from "@nolt/api-client/schema";
import { useAuth } from "./auth-provider";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
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
  const requestsQuery = useQuery({
    queryKey: ["external-requests", assignmentId],
    queryFn: async () => {
      const r = await api.GET("/api/v1/me/assignments/{id}/external-requests", {
        params: { path: { id: assignmentId } },
      });
      if (r.error) throw Error(errorMessage(r.error));
      return r.data.items as components["schemas"]["ExternalRequestDto"][];
    },
  });
  const items = requestsQuery.data ?? [];
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const pending = useRef<{
    requestKey: string;
    expectedContactRevision: number;
    replaceRequestId?: string;
  } | null>(null);
  const { refetch: refetchRequests, data: requestData, error: requestError } = requestsQuery;
  const load = useCallback(async () => { await refetchRequests(); }, [refetchRequests]);
  useEffect(() => {
    if (requestData) onRequestStatus(requestData.length > 0, requestData[0]?.state ?? null);
  }, [requestData, onRequestStatus]);
  useEffect(() => {
    if (requestError && !requestData) setError(requestError instanceof Error ? requestError.message : "Could not load request status.");
  }, [requestError, requestData]);
  const active = items[0];
  const approved = active?.state === "APPROVED";
  const correction = active?.state === "CHANGES_REQUIRED";
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

      {contactDirty && (
        <p className="text-sm">Save recipient changes before sending.</p>
      )}
      {!approved && <div className="flex flex-wrap gap-2">
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
      </div>}
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
      {correction && <p role="status" className="text-sm text-amber-800">The original answers are preserved. Send a new request after reviewing the feedback.</p>}
      {correction && (active as typeof active & { correctionReason?: string | null })?.correctionReason && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm"><p className="font-medium">HR feedback</p><p className="mt-1 whitespace-pre-wrap break-words">{(active as typeof active & { correctionReason?: string | null }).correctionReason}</p></div>}

      {active?.state === "SUBMITTED" && <p role="status" className="text-sm">Guarantor submitted the form. Awaiting HR review.</p>}
      {active && <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Latest request:</span><Badge variant="secondary">{active.state.toLowerCase().replaceAll("_", " ")}</Badge></div>}
      <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">View request history ({items.length})</summary>
      <ul className="mt-3 space-y-2">
        {items.map((i) => (
          <li className="break-words rounded-md border p-3 text-sm" key={i.id}>
            {i.email} — {i.state.toLowerCase().replaceAll("_", " ")}
            <br />
            Link expires: {new Date(i.expiresAt).toLocaleString()}
            {(i as typeof i & { correctionReason?: string | null }).correctionReason && <p className="mt-1 text-sm text-amber-700">HR corrections: {(i as typeof i & { correctionReason?: string | null }).correctionReason}</p>}
          </li>
        ))}
      </ul></details>
    </section>
  );
}
