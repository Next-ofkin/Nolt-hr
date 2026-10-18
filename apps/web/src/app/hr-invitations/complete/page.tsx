"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthFrame } from "@/components/auth-form";

export default function HrInvitationCompletePage() {
  const [message, setMessage] = useState("Checking authenticator verification…");
  const [csrf, setCsrf] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void (async () => {
      const flow = await fetch("/api/v1/auth/flow", { credentials: "same-origin", cache: "no-store" });
      if (!flow.ok) throw Error("This verification has expired. Contact your administrator.");
      const state: unknown = await flow.json();
      if (!state || typeof state !== "object" || !("stage" in state) || state.stage !== "hr_invitation" ||
          !("csrfToken" in state) || typeof state.csrfToken !== "string")
        throw Error("Complete your HR invitation authenticator verification first.");
      const response = await fetch("/api/v1/hr-invitations/verification", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw Error("Your HR invitation or authenticator verification could not be confirmed.");
      const proof: unknown = await response.json();
      if (!proof || typeof proof !== "object" || !("verified" in proof) ||
          proof.verified !== true || !("activationAllowed" in proof) || proof.activationAllowed !== false)
        throw Error("HR invitation verification could not be confirmed.");
      setCsrf(state.csrfToken);
      setReady(true);
      setMessage("Choose a password for your verified HR invitation. Account activation will remain pending.");
    })().catch(e => setMessage(e instanceof Error ? e.message : "Verification unavailable."));
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) { setMessage("Passwords do not match."); return; }
    setBusy(true);
    try {
      const result = await fetch("/api/v1/hr-invitations/password", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ password }),
      });
      if (!result.ok) throw Error("Password setup failed. Confirm your verification and try again.");
      setReady(false);
      setPassword("");
      setConfirm("");
      setMessage("Your password has been set. HR account activation remains pending administrator approval.");
    } catch(e) {
      setMessage(e instanceof Error ? e.message : "Password setup unavailable.");
    } finally { setBusy(false); }
  }
  return (
    <AuthFrame title="HR invitation verification" description="HR account access is granted only after a separate approved activation step.">
      <p role="status" className="mt-6 text-sm">{message}</p>
      {ready && (
        <form className="mt-5 space-y-3" onSubmit={submit}>
          <label className="block text-sm" htmlFor="hr-password">Choose a password</label>
          <input id="hr-password" className="w-full rounded-md border p-3" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} />
          <label className="block text-sm" htmlFor="hr-confirm">Confirm password</label>
          <input id="hr-confirm" className="w-full rounded-md border p-3" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirm} onChange={e => setConfirm(e.target.value)} />
          <button type="submit" disabled={busy} className="w-full rounded-md bg-primary p-3 text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Save password"}</button>
        </form>
      )}
      <Link href="/login" className="mt-5 block text-sm text-primary underline">Back to sign in</Link>
    </AuthFrame>
  );
}
