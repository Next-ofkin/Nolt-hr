"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import { AccountMenu } from "./account-menu";
import { brand } from "@/lib/brand";
import {
  BriefcaseBusiness, ChevronRight, FileStack, LayoutDashboard,
  Menu, PackageOpen, PanelLeftClose, ShieldCheck, X,
} from "lucide-react";

type Page = "forms" | "employees" | "packs";
type NavItem = { href: string; label: string; page: Page; icon: typeof FileStack };

export function WorkspaceShell({
  children,
  active = "forms",
}: {
  children: React.ReactNode;
  active?: Page;
}) {
  const { session } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  const isDeveloper = !!session?.permissions.includes("hr.accounts.manage");
  const items: NavItem[] = [
    ...(isDeveloper ? [{ href: "/", label: "Developer overview", page: "forms" as Page, icon: LayoutDashboard }] : []),
    ...(session?.permissions.includes("employees.manage") ? [{ href: "/employees", label: "Employees", page: "employees" as Page, icon: BriefcaseBusiness }] : []),
    ...(!isDeveloper ? [{ href: "/", label: session?.permissions.includes("profile.own") ? "My onboarding" : "Forms", page: "forms" as Page, icon: FileStack }] : []),
    ...(session?.permissions.includes("forms.manage") && !isDeveloper ? [{ href: "/packs", label: "Onboarding packs", page: "packs" as Page, icon: PackageOpen }] : []),
  ];

  const navigation = (
    <nav aria-label="Main navigation" className="space-y-1.5 px-3">
      <p className="px-3 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-[0.17em] text-white/50">
        Workspace
      </p>
      {items.map(({ href, label, page, icon: Icon }) => {
        const selected = active === page;
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setMenuOpen(false)}
            aria-current={selected ? "page" : undefined}
            className={`group flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${selected ? "bg-bright text-navy shadow-sm" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
          >
            <Icon size={19} aria-hidden="true" className="shrink-0" />
            <span className="min-w-0 flex-1">{label}</span>
            {selected && <ChevronRight size={15} aria-hidden="true" className="text-navy" />}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      {menuOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/55 lg:hidden"
        />
      )}
      <aside
        id="nolt-workspace-sidebar"
        aria-label="Workspace sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-[270px] flex-col bg-navy text-white shadow-2xl transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:w-[260px] lg:shrink-0 lg:translate-x-0 lg:shadow-none ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between gap-2 px-5 pb-6 pt-7">
          <Link
            href="/"
            onClick={() => setMenuOpen(false)}
            aria-label={`${brand.name} ${brand.productName} home`}
            className="flex min-w-0 items-center gap-3"
          >
            <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/95 text-xl font-extrabold text-navy shadow-sm">
              {brand.logoPath ? <img src={brand.logoPath} alt="" className="size-full object-contain" /> : brand.name.slice(0,1)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-bold tracking-tight">{brand.name}</span>
              <span className="block text-xs text-white/60">{brand.productName}</span>
            </span>
          </Link>
          <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="rounded-lg p-2 text-white/80 hover:bg-white/10 lg:hidden">
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-5">{navigation}</div>
        <div className="border-t border-white/15 p-4">
          <div className="mb-3 flex items-center gap-2 rounded-lg px-2 text-xs text-white/60">
            <ShieldCheck size={15} aria-hidden="true" />
            <span>Secure HR workspace</span>
          </div>
          <div className="rounded-xl bg-white p-1 text-foreground [&_a]:w-full [&_a]:px-2 [&_a]:py-2">
            <AccountMenu />
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-white/95 px-4 shadow-sm backdrop-blur sm:px-7 lg:h-[72px] lg:px-9">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              aria-expanded={menuOpen}
              aria-controls="nolt-workspace-sidebar"
              onClick={() => setMenuOpen(true)}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border text-primary hover:bg-accent lg:hidden"
            ><Menu size={21} /></button>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">NOLT HR / Workspace</p>
              <h1 className="truncate text-sm font-semibold sm:text-base">
                {isDeveloper ? "Developer overview" : active === "employees" ? "Employee management" : active === "packs" ? "Onboarding packs" : session?.permissions.includes("profile.own") ? "My onboarding" : "Form management"}
              </h1>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground sm:flex">
            <PanelLeftClose size={15} aria-hidden="true" />
            {session?.name ?? "NOLT HR"}
          </div>
        </header>
        <main id="main-content" className="mx-auto w-full max-w-[1550px] min-w-0 flex-1 px-4 py-6 sm:px-7 sm:py-8 lg:px-9">
          {children}
        </main>
      </div>
    </div>
  );
}
