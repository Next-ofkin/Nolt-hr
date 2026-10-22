"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlarmClock, Bell, CheckCircle2, ClipboardList, Info } from "lucide-react";
import { api } from "@nolt/api-client";
import { useAuth } from "./auth-provider";
import { badgeText, kindLabel } from "@/lib/notices";

/** A bell with a number. It lists what needs your attention right now; lines disappear when the thing is done. */
export function NotificationBell() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const eligible = Boolean(
    session && !session.externalRequestId &&
      (session.permissions.includes("profile.own") || session.permissions.includes("employees.manage") ||
        session.permissions.includes("reviews.assigned") || session.permissions.includes("forms.manage")),
  );
  const query = useQuery({
    queryKey: ["notifications", session?.id],
    enabled: eligible,
    queryFn: async () => {
      const r = await api.GET("/api/v1/me/notifications");
      if (r.error || !r.data) throw Error("Could not load notifications.");
      return r.data;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  if (!eligible) return null;
  const count = query.data?.count ?? 0;
  const items = query.data?.items ?? [];
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label={count ? `Notifications, ${count} need your attention` : "Notifications, nothing needs your attention"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => { setOpen((v) => !v); if (!open) void query.refetch(); }}
        className="relative flex size-10 items-center justify-center rounded-full border bg-background text-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Bell size={19} aria-hidden="true" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-5 text-white">
            {badgeText(count)}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-3 top-16 z-50 max-h-[75dvh] overflow-y-auto rounded-2xl border bg-white shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[24rem]"
        >
          <p className="border-b px-4 py-3 text-sm font-semibold">Needs your attention</p>
          {query.isPending && <p role="status" className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>}
          {query.error && <p role="alert" className="px-4 py-6 text-sm text-red-700">Could not load. Try again in a moment.</p>}
          {query.data && items.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="size-8 text-emerald-600" aria-hidden="true" />
              You are all caught up.
            </div>
          )}
          <ul className="divide-y">
            {items.map((n) => {
              const Icon = n.kind === "late" ? AlarmClock : n.kind === "action" ? ClipboardList : Info;
              return (
                <li key={n.id}>
                  <Link href={n.href} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none">
                    <Icon className={`mt-0.5 size-5 flex-none ${n.kind === "late" ? "text-red-600" : n.kind === "action" ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
                    <span className="min-w-0 text-sm">
                      <span className="block break-words font-medium">{n.title}</span>
                      {n.detail && <span className="block break-words text-muted-foreground">{n.detail}</span>}
                      <span className="sr-only">{kindLabel(n.kind)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {query.data && query.data.items.length < query.data.count && (
            <p className="border-t px-4 py-3 text-xs text-muted-foreground">Showing the first {items.length}. Finish some to see the rest.</p>
          )}
        </div>
      )}
    </div>
  );
}
