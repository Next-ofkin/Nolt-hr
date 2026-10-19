"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@nolt/api-client";
import type { components } from "@nolt/api-client/schema";
import { useAuth } from "./auth-provider";
import { Button } from "./ui/button";
export function EmployeeInvitations({
  employeeId,
  revision,
}: {
  employeeId: string;
  revision: number;
}) {
  const { session } = useAuth();
  const [items, setItems] = useState<components["schemas"]["InvitationDto"][]>(
      [],
    ),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [request, setRequest] = useState<{
    key: string;
    replaceId?: string;
    revision: number;
  } | null>(null);
  const load = useCallback(async () => {
    const r = await api.GET("/api/v1/employees/{id}/invitations", {
      params: { path: { id: employeeId } },
    });
    if (r.error) throw Error(errorMessage(r.error));
    setItems(r.data.items);
  }, [employeeId]);
  const loadedEmployee = useRef<string | null>(null);
  useEffect(() => {
    if (loadedEmployee.current === employeeId) return;
    loadedEmployee.current = employeeId;
    setItems([]);
    setRequest(null);
    setError("");
    setNotice("");
    setLoading(true);
    void load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [load]);
  const latest = items[0],
    accepted = items.some((i) => i.state === "ACCEPTED");
  useEffect(() => {
    if (!latest || !["QUEUED", "SENDING"].includes(latest.state)) return;
    const interval = window.setInterval(() => { void load().catch(() => {}); }, 5000);
    return () => window.clearInterval(interval);
  }, [latest?.id, latest?.state, load]);
  async function send() {
    if (!session) return;
    const p = request ?? {
      key: crypto.randomUUID(),
      revision,
      ...(latest ? { replaceId: latest.id } : {}),
    };
    setRequest(p);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api.POST("/api/v1/employees/{id}/invitations", {
        headers: { "x-csrf-token": session.csrfToken },
        params: { path: { id: employeeId } },
        body: {
          expectedRevision: p.revision,
          requestKey: p.key,
          ...(p.replaceId ? { replaceInvitationId: p.replaceId } : {}),
        },
      });
      if (r.error) throw Error(errorMessage(r.error));
      setRequest(null);
      setItems([r.data, ...items.filter((i) => i.id !== r.data.id)]);
      setNotice("Invitation queued. Delivery status updates automatically.");
      void load().catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invitation request failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 border-t pt-5">
      <h3 className="font-semibold">Employee invitation</h3>
      <p className="text-sm text-muted-foreground">
        Send an invitation as soon as the employee record is saved. The employee
        verifies their email and MFA to activate Employee access; onboarding forms can come later.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      )}
      {loading ? (
        <p className="text-sm">Loading invitation status…</p>
      ) : latest ? (
        <div className="rounded-lg border p-3">
          <p className="font-medium">
            Invitation: {latest.state.toLowerCase()}
          </p>
          <p className="text-xs text-muted-foreground">
            Expires {new Date(latest.expiresAt).toLocaleString()} ·{" "}
            {latest.attempts} delivery attempts
          </p>
          {latest.errorCode && (
            <p className="mt-2 text-sm text-destructive">
              {latest.state === "UNCERTAIN"
                ? "Delivery could not be confirmed. Resend to replace the previous link."
                : "Email delivery failed. HR can resend after the sender issue is resolved."}
            </p>
          )}
          {latest.acceptedAt && (
            <p className="text-sm">
              Activated {new Date(latest.acceptedAt).toLocaleString()}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm">No invitation sent yet.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || loading || accepted}
          onClick={() => void send()}
        >
          {busy
            ? "Please wait…"
            : latest
              ? "Resend invitation"
              : "Send invitation"}
        </Button>
        <Button
          variant="outline"
          disabled={busy || loading}
          onClick={() => {
            setBusy(true);
            setError("");
            void load()
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          }}
        >
          Refresh invitation status
        </Button>
        {latest &&
          !["ACCEPTED", "REVOKED", "EXPIRED"].includes(latest.state) && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError("");
                void (async () => {
                  const r = await api.POST("/api/v1/invitations/{id}/revoke", {
                    headers: { "x-csrf-token": session!.csrfToken },
                    params: { path: { id: latest.id } },
                  });
                  if (r.error) throw Error(errorMessage(r.error));
                  setRequest(null);
                  await load();
                  setNotice(
                    "Invitation revoked. Its link can no longer activate onboarding.",
                  );
                })()
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              Revoke invitation
            </Button>
          )}
      </div>

    </section>
  );
}
