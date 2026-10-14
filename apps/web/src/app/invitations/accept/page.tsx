"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, errorMessage } from "@nolt/api-client";
import { AuthFrame } from "@/components/auth-form";
export default function Page() {
  const once = useRef(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const invitationId = new URLSearchParams(location.search).get("id"),
      fragment = new URLSearchParams(location.hash.slice(1));
    const access = fragment.get("access_token"),
      refresh = fragment.get("refresh_token"),
      hash = fragment.get("token_hash"),
      type = fragment.get("type");
    history.replaceState({}, "", "/invitations/accept");
    void (async () => {
      if (!invitationId || (!access && !hash))
        throw Error(
          "This email link is incomplete or expired. Ask HR to resend your invitation.",
        );
      const proof =
        access && refresh
          ? { access_token: access, refresh_token: refresh }
          : hash && (type === "invite" || type === "magiclink")
            ? { tokenHash: hash, type: type as "invite" | "magiclink" }
            : null;
      if (!proof)
        throw Error(
          "This invitation link is invalid. Ask HR for a new invitation.",
        );
      const r = await api.POST("/api/v1/invitations/exchange", {
        body: { invitationId, proof },
      });
      if (r.error) throw Error(errorMessage(r.error));
      location.replace("/auth/mfa");
    })().catch((e) => setError(e.message));
  }, []);
  return (
    <AuthFrame
      title="Accept your invitation"
      description="We are checking your invitation and verified email before authenticator verification."
    >
      {error ? (
        <div className="mt-6 space-y-4">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Link href="/login" className="text-sm text-primary underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <p role="status" className="mt-6 text-sm">
          Checking your secure email link…
        </p>
      )}
    </AuthFrame>
  );
}
