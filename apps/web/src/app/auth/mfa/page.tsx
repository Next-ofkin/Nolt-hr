"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, errorMessage } from "@nolt/api-client";
import type { components } from "@nolt/api-client/schema";
import { AuthFrame } from "@/components/auth-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth-provider";
export default function MfaPage() {
  const [flow, setFlow] = useState<components["schemas"]["FlowDto"] | null>(
      null,
    ),
    [code, setCode] = useState(""),
    [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const { refresh } = useAuth();
  async function load() {
    const r = await api.GET("/api/v1/auth/flow");
    if (r.error || !r.data) throw new Error(errorMessage(r.error));
    if (r.data.stage === "invitation") {
      window.location.replace("/invitations/complete");
      return;
    }
    setFlow(r.data);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  async function enroll() {
    if (!flow) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.POST("/api/v1/auth/mfa/enroll", {
        headers: { "x-csrf-token": flow.csrfToken },
      });
      if (r.error || !r.data) throw new Error(errorMessage(r.error));
      setFlow({ ...flow, ...r.data });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!flow) return;
    setBusy(true);
    setError(null);
    try {
      const r =
        flow.stage === "password"
          ? await api.POST("/api/v1/auth/password", {
              headers: { "x-csrf-token": flow.csrfToken },
              body: { password },
            })
          : await api.POST("/api/v1/auth/mfa/verify", {
              headers: { "x-csrf-token": flow.csrfToken },
              body: { factorId: flow.factorId, code },
            });
      if (r.error || !r.data) throw new Error(errorMessage(r.error));
      if (r.data.next === "password") {
        setCode("");
        await load();
      } else if (r.data.next === "invitation") {
        window.location.assign("/invitations/complete");
      } else if (r.data.next === "login") {
        window.location.assign("/login");
      } else {
        await refresh();
        window.location.assign("/");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame
      title={
        flow?.stage === "password"
          ? "Choose a new password"
          : flow?.stage === "enroll"
            ? "Set up your authenticator"
            : "Verify your sign-in"
      }
      description={
        flow?.stage === "enroll"
          ? "Add NOLT HR to an authenticator app, then enter its six-digit code."
          : flow?.stage === "password"
            ? "Your identity is verified. Set a new password, then sign in again."
            : "Enter the current six-digit code from your authenticator app."
      }
    >
      {error && (
        <p
          role="alert"
          className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {!flow && !error && <p className="mt-6 text-sm">Loading verification…</p>}
      {flow?.stage === "email" && (
        <p className="mt-6 text-sm">
          Check your email and open the verification link first.
        </p>
      )}
      {flow?.stage === "enroll" && !flow.qrCode && (
        <Button
          className="mt-6 w-full"
          disabled={busy}
          onClick={() => void enroll()}
        >
          Set up authenticator
        </Button>
      )}
      {flow?.qrCode && (
        <div className="mt-6 rounded-xl border p-4">
          <img
            src={flow.qrCode}
            alt="Scan this QR code in your authenticator app"
            width={220}
            height={220}
            className="mx-auto max-w-full"
          />
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-primary">
              Enter setup key manually
            </summary>
            <p className="mt-2 break-all rounded bg-muted p-3 font-mono select-all">
              {flow.secret}
            </p>
          </details>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Keep this setup key private. It is only shown during authenticator
            setup.
          </p>
        </div>
      )}
      {flow &&
        ((flow.stage === "enroll" && flow.factorId) ||
          flow.stage === "challenge" ||
          flow.stage === "password") && (
          <form onSubmit={verify} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="verification">
                {flow.stage === "password"
                  ? "New password"
                  : "Authenticator code"}
              </Label>
              <Input
                id="verification"
                type={flow.stage === "password" ? "password" : "text"}
                inputMode={flow.stage === "password" ? "text" : "numeric"}
                autoComplete={
                  flow.stage === "password" ? "new-password" : "one-time-code"
                }
                required
                minLength={flow.stage === "password" ? 12 : 6}
                maxLength={flow.stage === "password" ? 128 : 6}
                pattern={flow.stage === "password" ? undefined : "[0-9]{6}"}
                value={flow.stage === "password" ? password : code}
                onChange={(e) =>
                  flow.stage === "password"
                    ? setPassword(e.target.value)
                    : setCode(e.target.value.replace(/\D/g, ""))
                }
              />
            </div>
            <Button className="h-11 w-full" disabled={busy} type="submit">
              {flow.stage === "password"
                ? "Save new password"
                : "Verify and continue"}
            </Button>
          </form>
        )}
      <Link href="/login" className="mt-6 block text-sm text-primary underline">
        Back to sign in
      </Link>
      <p className="mt-6 text-xs leading-5 text-muted-foreground">
        Lost your authenticator? Contact your administrator for account
        recovery. An email reset does not bypass MFA.
      </p>
    </AuthFrame>
  );
}
