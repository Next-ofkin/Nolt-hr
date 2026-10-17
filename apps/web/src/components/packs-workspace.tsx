"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ArrowDown, ArrowUp, FileStack, Loader2, Plus, RefreshCw, Save, ShieldCheck, X } from "lucide-react";
import { useAuth } from "./auth-provider";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

type FormVersion = {
  id: string; formId: string; title: string; recipient: "EMPLOYEE" | "GUARANTOR" | "REFERENCE";
  version: number; status: string;
};
type PackItem = {
  id: string; formId: string; formVersionId: string; required: boolean; position: number;
};
type Pack = {
  id: string; name: string; description: string; employmentType: string;
  status: string; createdAt: string; items: PackItem[];
};
type Selected = { formId: string; formVersionId: string; required: boolean };
const headers = { "Content-Type": "application/json" };

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 401 ? "Your session expired. Please sign in again." : "Could not load HR packs or forms.");
  return response.json() as Promise<T>;
}

export function PacksWorkspace() {
  const { session } = useAuth();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [forms, setForms] = useState<FormVersion[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [selected, setSelected] = useState<Selected[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showComposer, setShowComposer] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [packRecords, formRecords] = await Promise.all([
        readJson<Pack[]>("/api/v1/packs"),
        readJson<FormVersion[]>("/api/v1/forms/published"),
      ]);
      setPacks(packRecords);
      setForms(formRecords.filter(form => form.status === "PUBLISHED"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the pack builder.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (session) void refresh(); }, [refresh, session]);

  const available = useMemo(() => forms.filter(form =>
    !selected.some(item => item.formId === form.formId) &&
    (form.title + " " + form.recipient).toLowerCase().includes(search.trim().toLowerCase()),
  ), [forms, selected, search]);

  function toggleAdd(form: FormVersion) {
    setSelected(current => current.some(item => item.formId === form.formId) ? current : [
      ...current, { formId: form.formId, formVersionId: form.id, required: true },
    ]);
    setNotice("");
  }
  function move(index: number, offset: number) {
    setSelected(current => {
      const destination = index + offset;
      if (destination < 0 || destination >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[destination]] = [copy[destination], copy[index]];
      return copy;
    });
  }
  function label(item: Selected | PackItem) {
    const form = forms.find(form => form.id === item.formVersionId);
    return form ? `${form.title} · v${form.version} · ${form.recipient.toLowerCase()}` : `Form version ${item.formVersionId.slice(0, 8)}`;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || busy || !selected.length) return;
    setError(""); setNotice(""); setBusy(true);
    try {
      const response = await fetch("/api/v1/packs", {
        method: "POST", credentials: "same-origin", headers: {
          ...headers, "x-csrf-token": session.csrfToken,
        },
        body: JSON.stringify({
          name: name.trim(), description: description.trim(), employmentType: employmentType.trim(),
          items: selected.map((item, order) => ({ ...item, order })),
        }),
      });
      if (!response.ok) {
        let message = "Could not save this pack. Check that all selected forms are still published.";
        if (response.status === 403) message = "Your account cannot manage HR packs.";
        if (response.status === 409) message = "A selected form changed. Refresh your forms and try again.";
        throw new Error(message);
      }
      setName(""); setDescription(""); setEmploymentType(""); setSelected([]); setSearch("");
      setShowComposer(false);
      setNotice("Pack draft saved. It has not been published or assigned to an employee.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create this pack.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.15em] text-primary">PEOPLE OPERATIONS</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Onboarding packs</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Group published forms into reusable onboarding packs. Save drafts now; publishing and employee assignment are coming next.
          </p>
        </div>
        <Button type="button" onClick={() => setShowComposer(value => !value)} disabled={!session || loading} className="gap-2">
          {showComposer ? <X size={16} /> : <Plus size={16} />}
          {showComposer ? "Close builder" : "Create pack"}
        </Button>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">{notice}</div>}

      {showComposer && <form onSubmit={event => void save(event)} className="rounded-2xl border bg-white p-5 sm:p-7 space-y-6">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-secondary p-3 text-primary"><FileStack size={22}/></span>
          <div><h2 className="text-xl font-semibold">New pack draft</h2><p className="text-sm text-muted-foreground">Choose published forms and their completion order.</p></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="pack-name">Pack name</Label>
            <Input id="pack-name" required minLength={1} maxLength={160} value={name} onChange={e => setName(e.target.value)} placeholder="New employee starter pack"/>
          </div>
          <div className="space-y-2"><Label htmlFor="pack-employment">Employment type</Label>
            <Input id="pack-employment" required minLength={1} maxLength={80} value={employmentType} onChange={e => setEmploymentType(e.target.value)} placeholder="Permanent, contract, part-time…"/>
          </div>
        </div>
        <div className="space-y-2"><Label htmlFor="pack-description">Description (optional)</Label>
          <Textarea id="pack-description" maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} placeholder="When should HR use this pack?"/>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <div className="flex items-center justify-between"><h3 className="font-semibold">Published form library</h3><span className="text-xs text-muted-foreground">{available.length} available</span></div>
            <Input aria-label="Search published forms" placeholder="Search published forms" value={search} onChange={e => setSearch(e.target.value)}/>
            <div className="max-h-80 space-y-2 overflow-auto">
              {available.map(form => <div key={form.id} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-3">
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{form.title}</p><p className="text-xs text-muted-foreground">Version {form.version} · {form.recipient.toLowerCase()}</p></div>
                <Button size="sm" type="button" variant="outline" onClick={() => toggleAdd(form)} aria-label={`Add ${form.title}`}><Plus size={15}/> Add</Button>
              </div>)}
              {!available.length && <p className="rounded-xl bg-secondary p-4 text-sm text-muted-foreground">No available published forms. Publish a form in the Form library first.</p>}
            </div>
          </section>
          <section className="space-y-3">
            <div className="flex items-center justify-between"><h3 className="font-semibold">Pack contents</h3><span className="text-xs text-muted-foreground">{selected.length} selected</span></div>
            {!selected.length ? <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">Select at least one form from the library.</p> :
              <ol className="space-y-2">{selected.map((item, index) => <li key={item.formId} className="rounded-xl border p-3 space-y-2">
                <div className="flex items-start gap-2"><span className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold">{index+1}</span><p className="min-w-0 flex-1 text-sm font-medium">{label(item)}</p>
                  <button type="button" aria-label="Remove form" onClick={() => setSelected(items => items.filter(x => x.formId !== item.formId))}><X size={16}/></button>
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={item.required} onChange={e => setSelected(items => items.map(x => x.formId === item.formId ? {...x, required:e.target.checked}:x))}/> Required</label>
                  <div className="flex gap-1"><Button type="button" size="sm" variant="outline" disabled={index===0} aria-label="Move up" onClick={() => move(index,-1)}><ArrowUp size={14}/></Button>
                    <Button type="button" size="sm" variant="outline" disabled={index===selected.length-1} aria-label="Move down" onClick={() => move(index,1)}><ArrowDown size={14}/></Button></div>
                </div>
              </li>)}</ol>}
          </section>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck size={16}/> Saved as draft only. No employee will be notified.</p>
          <Button type="submit" disabled={!session || busy || !name.trim() || !employmentType.trim() || selected.length===0}>
            {busy ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} Save pack draft
          </Button>
        </div>
      </form>}

      <section className="rounded-2xl border bg-white">
        <div className="flex items-center justify-between border-b p-5">
          <div><h2 className="text-lg font-semibold">Saved packs</h2><p className="text-sm text-muted-foreground">Draft packs prepared by HR.</p></div>
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void refresh()}><RefreshCw size={15}/> Refresh</Button>
        </div>
        {loading ? <p role="status" className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 size={18} className="animate-spin"/> Loading packs…</p> :
        packs.length === 0 ? <p className="p-8 text-sm text-muted-foreground">No packs saved yet. Create your first pack draft above.</p> :
        <div className="divide-y">{packs.map(pack => <article key={pack.id} className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{pack.name}</h3>
            <span className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold">{pack.status.toLowerCase()}</span></div>
          <p className="mt-1 text-xs text-muted-foreground">{pack.employmentType} · {pack.items.length} forms · {pack.items.filter(item => item.required).length} required</p>
          {pack.description && <p className="mt-2 text-sm text-muted-foreground">{pack.description}</p>}
          <ul className="mt-3 space-y-1 text-sm">{pack.items.map(item => <li key={item.id} className="text-muted-foreground">{item.position + 1}. {label(item)} {item.required ? "· required" : "· optional"}</li>)}</ul>
        </article>)}</div>}
      </section>
    </div>
  );
}
