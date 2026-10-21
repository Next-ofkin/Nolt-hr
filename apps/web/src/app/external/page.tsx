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
  /** Saves typed answers so a signature is bound to exactly what is on screen. */
  async function saveForSigning(): Promise<number> {
    if (!data || !session) throw new Error("Reload the form and try again.");
    const r = await api.PUT("/api/v1/external/request/draft", {
      headers: { "x-csrf-token": session.csrfToken },
      body: { expectedRevision: data.revision, answers },
    });
    if (r.error) throw Error(errorMessage(r.error));
    setData(r.data);
    setDirty(false);
    return r.data.revision;
  }
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
  const content = data ? normaliseForm(data.form) : null;
  const locked = !data || data.state === "SUBMITTED";
  return (
    <div className="min-h-screen bg-[#f3f8ff]">
      <header className="flex h-16 items-center gap-3 bg-[#010b2f] px-4 text-white">
        <div className="flex size-9 items-center justify-center rounded-[10px] bg-white text-lg font-bold text-[#010b2f]">N</div>
        <span className="text-base font-semibold">NOLT Finance</span>
        <span className="ml-auto text-xs font-semibold text-[#7cc4ff]">Secure link</span>
      </header>
      <main className="mx-auto max-w-xl space-y-4 px-4 pb-32 pt-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Your requested form</p>
          <h1 className="mt-1 text-2xl font-semibold leading-tight">{content?.title ?? "Your form"}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Only you can complete this request. Your answers are private from the employee who sent it.
            Tap Save draft to keep your work. This link stays open for 7 days.
          </p>
        </div>
        {session && (
          <Button variant="outline" className="h-11" onClick={() => void signOut().catch(() => setError("Could not sign out. Try again."))}>
            Close form
          </Button>
        )}
        {loading && <p role="status">Checking your session…</p>}
        {!loading && !session && <p>Open the private form link in your invitation email to continue.</p>}
        {error && <p role="alert" className="break-words rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
        {data && content && (
          <>
            {data.state === "SUBMITTED" ? (
              <p className="rounded-xl border border-[#bcd6f7] bg-[#e6f1ff] p-3 text-sm text-[#0a3a7a]">Submitted. HR will review it.</p>
            ) : content.fields.some((f) => ["file", "passport_photo", "signature"].includes(f.type)) ? (
              <p className="rounded-2xl border border-[#bcd6f7] bg-[#e6f1ff] p-4 text-sm leading-6 text-[#0a3a7a]">
                <b>Please have ready:</b> your documents or a phone camera, and your finger to sign.
              </p>
            ) : null}
            <div className="rounded-3xl border border-[#dbe6f7] bg-white p-4 sm:p-5">
              <FormPreview
                content={content}
                answers={answers}
                externalCsrfToken={session?.csrfToken}
                revision={data.revision}
                beforeSign={saveForSigning}
                disabled={busy || locked}
                onAnswer={(id, value) => {
                  setAnswers((old) => ({ ...old, [id]: value }));
                  setDirty(true);
                  setNotice("");
                  submitKey.current = null;
                }}
              />
            </div>
          </>
        )}
      </main>
      {data && data.state !== "SUBMITTED" && (
        <div className="fixed inset-x-0 bottom-0 z-10 flex gap-3 border-t border-[#dbe6f7] bg-white px-4 pb-5 pt-3">
          <Button variant="outline" className="h-[52px] flex-1 text-[15px] font-semibold" disabled={busy} onClick={() => void save(false)}>
            Save draft
          </Button>
          <Button className="h-[52px] flex-[1.3] text-[15px] font-semibold" disabled={busy} onClick={() => void save(true)}>
            Submit form
          </Button>
        </div>
      )}
    </div>
  );
}
