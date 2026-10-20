"use client";
import { useLiveRefresh } from "@/lib/live-refresh";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, CheckCircle2, Clock3, LockKeyhole, RefreshCw, ShieldCheck, Sparkles, Users, UserRoundCheck, UserRoundPlus } from "lucide-react";
import { useAuth } from "./auth-provider";
import { HrInvitationDrafts } from "./hr-invitation-drafts";
import { WorkspaceAccess } from "./workspace-access";
import { Button } from "./ui/button";

type Overview = {
  summary: { developers: number; hr: number; employees: number; totalActive: number };
  hrAccounts: { id: string; name: string; email: string; active: boolean; createdAt: string }[];
  inviteEnabled: boolean;
  hrPagination: { page: number; pageSize: number; total: number; totalPages: number };
};

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(n=>n[0]?.toUpperCase()??"").join("");

export function DeveloperWorkspace() {
  return <WorkspaceAccess permission="hr.accounts.manage"><DeveloperHome /></WorkspaceAccess>;
}

function DeveloperHome() {
  const { session } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(""); }
    try {
      const response = await fetch(`/api/v1/developer/overview?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(appliedSearch)}&status=${status}`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 403 ? "Your account does not have Developer administration access." : "We couldn't retrieve the account overview. Please try again.");
      const overview: Overview = await response.json();
      setData(overview);
      if (overview.hrPagination.page > overview.hrPagination.totalPages) setPage(overview.hrPagination.totalPages);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Could not load the Developer workspace.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, pageSize, appliedSearch, status]);
  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(() => load(true));

  const greeting = session?.name?.trim().split(/\s+/)[0] || "Developer";
  const stats = [
    { label: "Active accounts", value: data?.summary.totalActive, icon: Users, detail: "Across your workspace" },
    { label: "HR administrators", value: data?.summary.hr, icon: Building2, detail: "Manage the people team" },
    { label: "Employees", value: data?.summary.employees, icon: UserRoundCheck, detail: "Active employee identities" },
    { label: "System owners", value: data?.summary.developers, icon: ShieldCheck, detail: "Protected Developer role" },
  ];
  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-12">
      <section className="relative overflow-hidden rounded-[2rem] bg-navy px-6 py-9 text-white shadow-[0_24px_70px_-44px_#010b2f] sm:px-10 sm:py-11">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 size-80 rounded-full border border-white/15 bg-bright/10" />
        <div aria-hidden className="pointer-events-none absolute -bottom-48 right-28 size-96 rounded-full border border-white/10" />
        <div className="relative max-w-3xl space-y-5">
          <span className="inline-flex items-center gap-2 rounded-full border border-bright/30 bg-white/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-sky-100"><Sparkles size={14}/> NOLT PEOPLE · SYSTEM OWNER</span>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.65rem] sm:leading-tight">Good to see you, {greeting}.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-sky-50/80 sm:text-base">Your command centre for people, access and account governance. Everything you need to keep NOLT HR organised, secure and ready to grow.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-bright/20 px-3 py-2 text-xs font-medium text-sky-100"><CheckCircle2 size={15}/> Signed in with Developer access and MFA</div>
        </div>
      </section>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Workspace overview</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">People at a glance</h2></div>
        <Button variant="outline" className="rounded-xl" disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""}/> Refresh overview</Button>
      </div>
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800"><span>{error}</span><Button size="sm" variant="outline" onClick={()=>void load()}>Retry</Button></div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({label,value,icon:Icon,detail})=>(
          <div key={label} className="rounded-2xl border border-border bg-white p-5 shadow-[0_12px_35px_-28px_#0a1a5c]">
            <div className="flex items-center justify-between"><span className="text-sm font-medium text-muted-foreground">{label}</span><span className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary"><Icon size={19}/></span></div>
            <p className="mt-4 text-4xl font-semibold tracking-tight tabular-nums">{loading ? "—" : value ?? "—"}</p><p className="mt-2 text-xs text-muted-foreground">{detail}</p>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)]">
        <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_12px_35px_-28px_#0a1a5c]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5 sm:p-6">
            <div><h2 className="text-lg font-semibold tracking-tight">HR administration</h2><p className="mt-1 text-sm text-muted-foreground">HR administrators and their account status</p></div>
            <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">Read-only overview</span>
          </div>
          <form className="flex flex-wrap items-center gap-3 border-b bg-muted/40 px-5 py-4 sm:px-6" onSubmit={e => { e.preventDefault(); setPage(1); setAppliedSearch(search.trim()); }}>
            <label className="min-w-[12rem] flex-1"><span className="sr-only">Search HR administrators by name or email</span><input value={search} onChange={e=>setSearch(e.target.value)} maxLength={120} placeholder="Search name or email" className="h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"/></label>
            <label><span className="sr-only">Filter HR account status</span><select aria-label="HR account status" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}} className="h-10 rounded-xl border bg-white px-3 text-sm"><option value="all">All accounts</option><option value="active">Active only</option><option value="inactive">Inactive only</option></select></label>
            <Button type="submit" variant="outline" className="h-10 rounded-xl">Search</Button>
          </form>
          {loading ? <p role="status" className="p-8 text-sm text-muted-foreground">Loading administrator accounts…</p> : !data ? <p className="p-8 text-sm text-muted-foreground">Account information is unavailable.</p> : data.hrAccounts.length===0 ? <div className="px-6 py-14 text-center"><Users className="mx-auto text-muted-foreground"/><p className="mt-3 font-medium">No HR administrators found</p><p className="mt-1 text-sm text-muted-foreground">HR accounts will appear here when configured.</p></div> : <div className="divide-y">{data.hrAccounts.map(person=><div key={person.id} className="flex items-center gap-3 px-5 py-4 sm:px-6"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#eaf3f1] text-sm font-semibold text-[#1a665b]">{initials(person.name)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{person.name}</p><p className="truncate text-xs text-muted-foreground">{person.email}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${person.active?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-600"}`}>{person.active?"Active":"Inactive"}</span></div>)}</div>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span aria-live="polite">{data ? `Showing ${data.hrPagination.total === 0 ? 0 : (data.hrPagination.page-1)*data.hrPagination.pageSize+1}–${Math.min(data.hrPagination.page*data.hrPagination.pageSize,data.hrPagination.total)} of ${data.hrPagination.total}` : "—"} administrators</span>
              <label className="flex items-center gap-2">Rows per page
                <select aria-label="HR administrators per page" className="rounded-lg border bg-white px-2 py-1.5 text-foreground" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} disabled={loading}>
                  <option value={5}>5</option><option value={10}>10</option><option value={20}>20</option>
                </select>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <span className="mr-1 text-xs text-muted-foreground">Page {data?.hrPagination.page ?? 1} of {data?.hrPagination.totalPages ?? 1}</span>
              <Button type="button" size="sm" variant="outline" aria-label="Previous HR administrators page" disabled={loading || !data || page <= 1} onClick={() => setPage(p=>Math.max(1,p-1))}>Previous</Button>
              <Button type="button" size="sm" variant="outline" aria-label="Next HR administrators page" disabled={loading || !data || page >= data.hrPagination.totalPages} onClick={() => setPage(p=>p+1)}>Next</Button>
            </div>
          </div>
          <div className="border-t px-5 py-3 text-xs text-muted-foreground sm:px-6">Account data is restricted to authorised Developer sessions.</div>
        </section>
        <aside className="space-y-5">
          <HrInvitationDrafts />
          <section className="rounded-2xl border bg-white p-6">
            <div className="flex items-center gap-2 text-primary"><LockKeyhole size={20}/><h2 className="font-semibold">Your access, protected</h2></div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Developer permissions manage technical configuration and HR account governance. Employee records and sensitive HR reviews stay separate.</p>
            <Link href="/account" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">Review your account <ArrowRight size={16}/></Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
