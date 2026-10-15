"use client";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@nolt/api-client";
import { useAuth } from "./auth-provider";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ExternalRequests } from "./external-requests";

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
    void load();
  }, [assignmentId]);
  return (
    <form
      className="space-y-3 border-t pt-3"
      aria-label={`${recipient.toLowerCase()} recipient details`}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!session || !loaded || busy) return;
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
      <p className="text-sm text-muted-foreground">
        Prepare your {recipient.toLowerCase()}’s details. They will complete
        their own form through a separate secure request.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
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
            disabled={busy || !loaded}
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
            disabled={busy || !loaded}
            autoComplete="off"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !loaded}>
          {busy ? "Please wait…" : "Save recipient details"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void load()}
          disabled={busy}
        >
          Reload saved details
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
      {loaded && (
        <ExternalRequests
          assignmentId={assignmentId}
          contactRevision={revision}
          contactDirty={dirty || busy}
        />
      )}
    </form>
  );
}
