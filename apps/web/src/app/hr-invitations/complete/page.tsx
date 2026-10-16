"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthFrame } from "@/components/auth-form";

export default function HrInvitationCompletePage() {
  const [message, setMessage] = useState("Checking authenticator verification…");
  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/v1/auth/flow", { credentials: "same-origin" });
      if (!response.ok) throw Error("This verification has expired. Please contact your administrator.");
      const flow: unknown = await response.json();
      if (!flow || typeof flow !== "object" || !("stage" in flow) ||
          flow.stage !== "hr_invitation") {
        location.replace("/auth/mfa");
        return;
      }
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
