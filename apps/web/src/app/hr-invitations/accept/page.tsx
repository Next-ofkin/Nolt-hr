"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuthFrame } from "@/components/auth-form";

export default function HrInvitationAcceptPage() {
  const started = useRef(false);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const id = new URLSearchParams(location.search).get("id");
    const fragment = new URLSearchParams(location.hash.slice(1));
    const access = fragment.get("access_token");
    const refresh = fragment.get("refresh_token");
    const hash = fragment.get("token_hash");
    const type = fragment.get("type");
    history.replaceState({}, "", "/hr-invitations/accept");
    void (async () => {
      const proof = access && refresh
        ? { access_token: access, refresh_token: refresh }
        : hash && (type === "invite" || type === "magiclink")
          ? { tokenHash: hash, type }
          : null;
      if (!id || !proof) throw Error("This invitation link is incomplete or expired.");
      const response = await fetch("/api/v1/hr-invitations/exchange", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId: id, proof }),
      });
      if (!response.ok) throw Error(
        response.status === 503
          ? "HR invitation activation is not available yet. Please contact your administrator."
          : "This invitation could not be verified. Please contact your administrator.",
      );
      // A successful exchange is an identity check only. No HR role/session yet.
      setChecked(true);
    })().catch((reason: unknown) =>
      setError(reason instanceof Error ? reason.message : "Unable to verify the invitation."),
    );
  }, []);
  return (
    <AuthFrame title="HR invitation" description="Verify the secure invitation sent to your email address.">
      {error ? (
        <div className="mt-6 space-y-4">
          <p role="alert" className="text-sm text-destructive">{error}</p>
          <Link href="/login" className="text-sm text-primary underline">Back to sign in</Link>
        </div>
      ) : checked ? (
        <p role="status" className="mt-6 text-sm">
          Your invitation link was verified. HR account activation is not available yet; contact your administrator.
        </p>
      ) : (
        <p role="status" className="mt-6 text-sm">Checking your secure invitation…</p>
      )}
    </AuthFrame>
  );
}
