"use client";
import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@nolt/api-client";
import { AuthFrame } from "@/components/auth-form";
export default function Page() {
  const once = useRef(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const id = new URLSearchParams(location.search).get("id"),
      f = new URLSearchParams(location.hash.slice(1));
    const access = f.get("access_token"),
      refresh = f.get("refresh_token"),
      hash = f.get("token_hash"),
      type = f.get("type");
    history.replaceState({}, "", "/external/accept");
    void (async () => {
      const proof =
        access && refresh
          ? { access_token: access, refresh_token: refresh }
          : hash &&
              type &&
              ["invite", "magiclink", "signup", "email"].includes(type)
            ? {
                tokenHash: hash,
                type: type as "invite" | "magiclink" | "signup" | "email",
              }
            : null;
      if (!id || !proof)
        throw Error(
          "This request link is incomplete or expired. Ask the employee to replace the request.",
        );
      const r = await api.POST("/api/v1/external/exchange", {
        body: { requestId: id, proof },
      });
      if (r.error) throw Error(errorMessage(r.error));
      location.replace("/external");
    })().catch(async (e) => {
      // If this device already has an open form session, just carry on to it.
      try {
        const existing = await api.GET("/api/v1/external/session");
        if (existing.data?.requestId) {
          location.replace("/external");
          return;
        }
      } catch {
        /* fall through to the message */
      }
      const raw = e instanceof Error ? e.message : "";
      setError(
        /already used|failed|expired|incomplete/i.test(raw) || !raw
          ? "This link has already been used or has expired. Each email link works once. If you already opened the form on this phone, open this page again from the same browser. Otherwise, please ask the person who invited you to send a new link. Nothing has been lost."
          : raw,
      );
    });
  }, []);
  return (
    <AuthFrame
      title="Open your form request"
      description="Opening the form you were invited to complete."
    >
      <p className="mt-6 text-sm" role={error ? "alert" : "status"}>
        {error || "Checking your secure email link…"}
      </p>
    </AuthFrame>
  );
}
