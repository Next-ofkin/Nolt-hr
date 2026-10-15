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
    })().catch((e) =>
      setError(
        e instanceof Error ? e.message : "Could not verify your request.",
      ),
    );
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
