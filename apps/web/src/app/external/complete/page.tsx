"use client";
import { useState } from "react";
import { api, errorMessage } from "@nolt/api-client";
import { AuthFrame } from "@/components/auth-form";
import { Button } from "@/components/ui/button";
export default function Page() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function open() {
    setBusy(true);
    setError("");
    try {
      const f = await api.GET("/api/v1/auth/flow");
      if (f.error || !f.data) throw Error(errorMessage(f.error));
      if (f.data.stage !== "external")
        throw Error(
          "Complete authenticator verification before opening this request.",
        );
      const r = await api.POST("/api/v1/external/activate", {
        headers: { "x-csrf-token": f.data.csrfToken },
      });
      if (r.error) throw Error(errorMessage(r.error));
      location.replace("/external");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open your request.");
      setBusy(false);
    }
  }
  return (
    <AuthFrame
      title="Your identity is verified"
      description="Continue to the form sent to your verified email. Your answers go directly to HR."
    >
      <Button className="mt-6" onClick={() => void open()} disabled={busy}>
        {busy ? "Opening…" : "Open my requested form"}
      </Button>
      {error && (
        <p role="alert" className="mt-4 text-sm">
          {error}
        </p>
      )}
    </AuthFrame>
  );
}
