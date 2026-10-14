"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { WorkspaceShell } from "@/components/workspace-shell";
import { Button } from "@/components/ui/button";
export default function AccountPage() {
  const { session, loading, error, signOut } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!loading && !session && !error) router.replace("/login");
  }, [session, loading, error, router]);
  async function logout(all = false) {
    setBusy(true);
    try {
      await signOut(all);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Sign-out failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <WorkspaceShell>
      <section className="mx-auto max-w-2xl rounded-xl border bg-white p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">Your account</h1>
        {loading ? (
          <p className="mt-5">Verifying session…</p>
        ) : session ? (
          <>
            <dl className="mt-6 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-4 text-sm">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="break-words">{session.name}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="break-all">{session.email}</dd>
              <dt className="text-muted-foreground">Role</dt>
              <dd>{session.role.replaceAll("_", " ")}</dd>
              <dt className="text-muted-foreground">Sign-in</dt>
              <dd>Supabase Auth</dd>
              <dt className="text-muted-foreground">Verification</dt>
              <dd>
                {session.mfaVerified
                  ? "Authenticator verified (MFA)"
                  : "Verification required"}
              </dd>
              <dt className="text-muted-foreground">Expires</dt>
              <dd>
                {new Date(session.expiresAt).toLocaleString("en-NG", {
                  timeZone: "Africa/Lagos",
                })}
              </dd>
            </dl>
            <p className="mt-6 text-xs leading-5 text-muted-foreground">
              Sessions expire after 30 minutes of inactivity or 8 hours in
              total. Sign-out below revokes application access; provider sign-in
              may remain active.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={() => void logout()} disabled={busy}>
                Sign out
              </Button>
              <Button
                variant="outline"
                className="h-auto min-h-9 whitespace-normal text-center"
                onClick={() => void logout(true)}
                disabled={busy}
              >
                Sign out of all application sessions
              </Button>
            </div>
          </>
        ) : null}
        {(notice || error) && (
          <p role="alert" className="mt-5 text-sm text-destructive">
            {notice || error}
          </p>
        )}
      </section>
    </WorkspaceShell>
  );
}
