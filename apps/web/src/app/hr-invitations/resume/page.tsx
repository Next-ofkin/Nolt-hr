"use client";
import { useState } from "react";
import Link from "next/link";
import { AuthFrame } from "@/components/auth-form";

export default function HrInvitationResumePage() {
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function submit(event:React.FormEvent) {
    event.preventDefault();
    if(busy) return;
    setBusy(true);setError("");
    try {
      const response=await fetch("/api/v1/hr-invitations/resume",{
        method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({email:email.trim().toLowerCase(),password}),
      });
      if(!response.ok) throw Error("We could not reopen this invitation. Confirm your account credentials or contact the administrator.");
      const data:unknown=await response.json();
      if(!data||typeof data!=="object"||!("next" in data)||data.next!=="mfa")
        throw Error("Re-verification is temporarily unavailable.");
      setPassword("");
      window.location.assign("/auth/mfa");
    }catch(e){setError(e instanceof Error?e.message:"Unable to reverify.");}
    finally{setBusy(false);}
  }
  return <AuthFrame title="Reverify your HR invitation"
    description="Your original setup is saved. Sign in with your existing password and confirm your authenticator again. HR access still requires separate approval.">
    <form onSubmit={submit} className="mt-7 space-y-4">
      <label className="block text-sm">Invitation email
        <input className="mt-2 w-full rounded-md border p-3" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/>
      </label>
      <label className="block text-sm">Existing password
        <input className="mt-2 w-full rounded-md border p-3" type="password" autoComplete="current-password" required value={password} maxLength={128} onChange={e=>setPassword(e.target.value)}/>
      </label>
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      <button disabled={busy} type="submit" className="w-full rounded-md bg-primary p-3 text-primary-foreground disabled:opacity-50">
        {busy?"Checking…":"Continue to authenticator"}
      </button>
    </form>
    <Link href="/login" className="mt-5 block text-sm text-primary underline">Back to sign in</Link>
  </AuthFrame>;
}
