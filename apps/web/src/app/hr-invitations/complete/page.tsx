"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthFrame } from "@/components/auth-form";

export default function HrInvitationCompletePage() {
  const [message, setMessage] = useState("Checking authenticator verification…");
  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/v1/hr-invitations/verification", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw Error(
        response.status === 503
          ? "HR invitation verification is not available yet. Contact your administrator."
          : "Your HR invitation or authenticator verification could not be confirmed.",
      );
      const proof: unknown = await response.json();
      if (!proof || typeof proof !== "object" || !("verified" in proof) ||
          proof.verified !== true || !("activationAllowed" in proof) ||
          proof.activationAllowed !== false)
        throw Error("HR invitation verification could not be confirmed.");
      setMessage("Your email and authenticator have been verified. HR account activation is not available yet. Please contact your administrator.");
    })().catch(e => setMessage(e instanceof Error ? e.message : "Verification unavailable."));
  }, []);
  return (
    <AuthFrame title="HR invitation verification" description="HR account access is granted only after a separate approved activation step.">
      <p role="status" className="mt-6 text-sm">{message}</p>
      <Link href="/login" className="mt-5 block text-sm text-primary underline">Back to sign in</Link>
    </AuthFrame>
  );
}
