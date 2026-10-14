"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, errorMessage } from "@nolt/api-client";
import { AuthFrame } from "@/components/auth-form";
export default function CallbackPage() {
  const once = useRef(false),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const q = new URLSearchParams(window.location.search);
    const code = q.get("code");
    window.history.replaceState({}, "", "/auth/callback");
    void (async () => {
      if (!code)
        throw new Error(
          "This link is missing verification details. Sign in or request a new email.",
        );
      const flow = await api.GET("/api/v1/auth/flow");
      if (!flow.data)
        throw new Error(
          "Open the email in the browser that requested it. If your email is already confirmed, return to sign in.",
        );
      const r = await api.POST("/api/v1/auth/callback", {
        headers: { "x-csrf-token": flow.data.csrfToken },
        body: { code },
      });
      if (r.error) throw new Error(errorMessage(r.error));
      window.location.replace("/auth/mfa");
    })().catch((e) => setError(e.message));
  }, []);
  return (
    <AuthFrame
      title="Confirming your account"
      description="We are checking the secure link from your email."
    >
      {error ? (
        <>
          <p role="alert" className="mt-5 text-sm text-destructive">
            {error}
          </p>
          <Link
            href="/login"
            className="mt-6 block text-sm text-primary underline"
          >
            Back to sign in
          </Link>
          <Link
            href="/recovery"
            className="mt-3 block text-sm text-primary underline"
          >
            Request a new recovery email
          </Link>
        </>
      ) : (
        <p className="mt-6 text-sm">Please wait…</p>
      )}
    </AuthFrame>
  );
}
