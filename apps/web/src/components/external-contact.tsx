"use client";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@nolt/api-client";
import { useAuth } from "./auth-provider";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ExternalRequests } from "./external-requests";
import { CheckCircle2, LockKeyhole } from "lucide-react";

export function ExternalContact({
  assignmentId,
  recipient,
}: {
  assignmentId: string;
  recipient: string;
}) {
  const { session } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [requestState, setRequestState] = useState<{ hasRequest: boolean; latestState: string | null } | null>(null);
  const canEdit = requestState !== null && (!requestState.hasRequest || requestState.latestState === "CHANGES_REQUIRED");
  const approved = requestState?.latestState === "APPROVED";
  const needsCorrections = requestState?.latestState === "CHANGES_REQUIRED";
  const onRequestStatus = useCallback((hasRequest: boolean, latestState: string | null) => {
    setRequestState({ hasRequest, latestState });
  }, []);
  async function load() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api.GET("/api/v1/me/assignments/{id}/external-contact", {
        params: { path: { id: assignmentId } },
      });
      if (r.error) throw new Error(errorMessage(r.error));
      setName(r.data.fullName ?? "");
      setEmail(r.data.email ?? "");
      setRevision(r.data.revision);
      setDirty(false);
      setLoaded(true);
    } catch (e) {
      setLoaded(false);
      setError(
        e instanceof Error ? e.message : "Could not load recipient details.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    setRequestState(null);
    void load();
  }, [assignmentId]);
  return (
    <form
      className="space-y-4 border-t pt-4"
      aria-label={`${recipient.toLowerCase()} recipient details`}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!session || !loaded || busy || !canEdit) return;
        setBusy(true);
        setError("");
        setNotice("");
        try {
          const r = await api.PUT(
            "/api/v1/me/assignments/{id}/external-contact",
            {
              params: { path: { id: assignmentId } },
              headers: { "x-csrf-token": session.csrfToken },
              body: { fullName: name, email, expectedRevision: revision },
            },
          );
          if (r.error) throw new Error(errorMessage(r.error));
          setName(r.data.fullName ?? "");
          setEmail(r.data.email ?? "");
          setRevision(r.data.revision);
          setDirty(false);
          setNotice("Recipient details saved.");
        } catch (e) {
          setError(
            e instanceof Error
              ? e.message
              : "Could not save recipient details.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      {approved ? (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold">Guarantor approved</p>
            <p className="text-sm">HR has approved this evidence. No further action is required, and recipient details are locked.</p>
          </div>
        </div>
      ) : needsCorrections ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="font-semibold text-amber-950">Action required: update and resend</p>
          <p className="mt-1 text-sm text-amber-900">HR has requested corrections. Review the feedback below, update the recipient details if necessary, and send a fresh secure link.</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {requestState?.hasRequest
            ? "Your guarantor request is in progress. Recipient details are locked while you wait for HR's decision."
            : `Enter your ${recipient.toLowerCase()}’s details to send them a secure form.`}
        </p>
      )}
      {!approved && <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`external-name-${assignmentId}`}>
            Recipient full name
          </Label>
          <Input
            id={`external-name-${assignmentId}`}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
              setNotice("");
            }}
            required
            maxLength={160}
            disabled={busy || !loaded || !canEdit}
            autoComplete="off"
          />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`external-email-${assignmentId}`}>
            Recipient email
          </Label>
          <Input
            id={`external-email-${assignmentId}`}
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setDirty(true);
              setNotice("");
            }}
            required
            maxLength={254}
            disabled={busy || !loaded || !canEdit}
            autoComplete="off"
          />
        </div>
      </div>}
      {!approved && <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !loaded || !canEdit}>
          {busy ? "Please wait…" : "Save recipient details"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void load()}
          disabled={busy}
        >
          Reload details
        </Button>
      </div>}
      {approved && <p className="flex items-center gap-2 text-xs text-muted-foreground"><LockKeyhole className="h-4 w-4" aria-hidden="true" /> Submitted recipient details are securely retained.</p>}
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
      {loaded && (
        <ExternalRequests
          assignmentId={assignmentId}
          contactRevision={revision}
          contactDirty={dirty || busy}
          onRequestStatus={onRequestStatus}
        />
      )}
    </form>
  );
}
