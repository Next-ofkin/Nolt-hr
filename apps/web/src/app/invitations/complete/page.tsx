"use client";
import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@nolt/api-client";
import type { components } from "@nolt/api-client/schema";
import { AuthFrame } from "@/components/auth-form";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export default function Page() {
  const [details, setDetails] = useState<
      components["schemas"]["InvitationActivationDto"] | null
    >(null),
    [csrf, setCsrf] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { refresh } = useAuth();
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void (async () => {
      const flow = await api.GET("/api/v1/auth/flow");
      if (!flow.data) throw Error("Open your invitation email to continue.");
      if (flow.data.stage !== "invitation") {
        location.replace("/auth/mfa");
        return;
      }
      const r = await api.GET("/api/v1/invitations/activation");
      if (r.error) throw Error(errorMessage(r.error));
      setDetails(r.data);
      setCsrf(flow.data.csrfToken);
    })().catch((e) => setError(e.message));
  }, []);
  return (
    <AuthFrame
      title="Activate your employee account"
      description="Your email and authenticator have been verified. Confirm your onboarding access."
    >
      {error && (
        <p
          role="alert"
          className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {!details && !error && (
        <p role="status" className="mt-6">
          Loading your invitation…
        </p>
      )}
      {details && (
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (details.requiresPassword && password !== confirmation) {
              setError("The passwords do not match.");
              return;
            }
            setBusy(true);
            setError("");
            void (async () => {
              const r = await api.POST("/api/v1/invitations/activate", {
                headers: { "x-csrf-token": csrf },
                body: details.requiresPassword ? { password } : {},
              });
              if (r.error) throw Error(errorMessage(r.error));
              await refresh();
              location.assign("/");
            })()
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          }}
        >
          <div className="rounded-lg border p-4">
            <p className="break-words font-medium">{details.employeeName}</p>
            <p className="break-all text-sm text-muted-foreground">
              {details.email}
            </p>
          </div>
          {details.requiresPassword && (
            <>
              <div>
                <Label htmlFor="new-password">Choose a password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Use at least 12 characters.
                </p>
              </div>
              <div>
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </div>
            </>
          )}
          <Button disabled={busy} className="w-full">
            {busy ? "Activating…" : "Activate employee account"}
          </Button>
        </form>
      )}
    </AuthFrame>
  );
}
