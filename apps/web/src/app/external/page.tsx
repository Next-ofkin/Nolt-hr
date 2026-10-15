"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage, normaliseForm } from "@nolt/api-client";
import type { components } from "@nolt/api-client/schema";
import type { Answers } from "@nolt/form-schemas";
import { FormPreview } from "@/components/form-preview";
import { Button } from "@/components/ui/button";
export default function Page() {
  const [session, setSession] = useState<
    components["schemas"]["ExternalSessionDto"] | null
  >(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void api
      .GET("/api/v1/external/session")
      .then((r) => {
        if (active && r.data) setSession(r.data);
      })
      .catch(() => {
        if (active) setError("Could not open your form. Try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function signOut() {
    if (!session) return;
    const r = await api.POST("/api/v1/external/logout", {
      headers: { "x-csrf-token": session.csrfToken },
    });
    if (r.error) throw Error(errorMessage(r.error));
    setSession(null);
    setData(null);
    setAnswers({});
    setNotice("Form closed. Thank you.");
  }
  const [data, setData] = useState<
      components["schemas"]["ExternalWorkspaceDto"] | null
    >(null),
    [answers, setAnswers] = useState<Answers>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const submitKey = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api.GET("/api/v1/external/request");
      if (r.error) throw Error(errorMessage(r.error));
      setData(r.data);
      setAnswers(r.data.answers);
      setDirty(false);
      submitKey.current = null;
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Could not load this request.");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (session?.requestId) void load();
  }, [session?.requestId, load]);
  async function save(submit: boolean) {
    if (!data || !session) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      let current = data;
      if (data.state !== "SUBMITTED" && (!submit || dirty)) {
        const r = await api.PUT("/api/v1/external/request/draft", {
          headers: { "x-csrf-token": session.csrfToken },
          body: { expectedRevision: data.revision, answers },
        });
        if (r.error) throw Error(errorMessage(r.error));
        current = r.data;
        setData(current);
        setAnswers(current.answers);
        setDirty(false);
      }
      if (submit) {
        submitKey.current ??= crypto.randomUUID();
        const r = await api.POST("/api/v1/external/request/submit", {
          headers: { "x-csrf-token": session.csrfToken },
          body: {
            expectedRevision: current.revision,
            requestKey: submitKey.current,
          },
        });
        if (r.error) throw Error(errorMessage(r.error));
        setData(r.data);
        setAnswers(r.data.answers);
        setNotice("Your form was submitted directly to HR.");
      } else {
        submitKey.current = null;
        setNotice("Draft saved.");
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save your response.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Your requested form</h1>
        {session && (
          <Button
            variant="outline"
            onClick={() =>
              void signOut().catch(() =>
                setError("Could not sign out. Try again."),
              )
            }
          >
            Close form
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Only you can complete this request. Your answers are private from the
        employee who sent it.
      </p>
      {loading && <p role="status">Checking your session…</p>}
      {!loading && !session && (
        <p>Open the private form link in your invitation email to continue.</p>
      )}
      {error && (
        <p role="alert" className="break-words text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {session?.requestId && (
        <Button variant="outline" disabled={busy} onClick={() => void load()}>
          Reload saved form
        </Button>
      )}
      {data && (
        <>
          <p className="text-sm">
            {data.state === "SUBMITTED"
              ? "Submitted — awaiting HR review"
              : "Draft — not submitted"}
          </p>
          {normaliseForm(data.form).fields.some((f) =>
            ["file", "signature"].includes(f.type),
          ) && (
            <p className="rounded-lg border p-3 text-sm">
              Attachments and signatures are not available in this workspace
              yet. Forms requiring them cannot be submitted.
            </p>
          )}
          <FormPreview
            content={normaliseForm(data.form)}
            answers={answers}
            disabled={busy || data.state === "SUBMITTED"}
            onAnswer={(id, value) => {
              setAnswers((old) => ({ ...old, [id]: value }));
              setDirty(true);
              setNotice("");
              submitKey.current = null;
            }}
          />
          {data.state !== "SUBMITTED" && (
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void save(false)}
              >
                Save draft
              </Button>
              <Button disabled={busy} onClick={() => void save(true)}>
                Submit to HR
              </Button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
