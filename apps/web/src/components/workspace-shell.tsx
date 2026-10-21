"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./auth-provider";
import { AccountMenu } from "./account-menu";
import { brand } from "@/lib/brand";
import {
  BriefcaseBusiness, ChevronRight, FileStack, LayoutDashboard,
  PackageOpen, PanelLeftClose, ShieldCheck, UserRound,
} from "lucide-react";

type Page = "forms" | "employees" | "packs";
type NavItem = { href: string; label: string; short: string; page: Page; icon: typeof FileStack };

export function WorkspaceShell({
  children,
  active = "forms",
}: {
  children: React.ReactNode;
  active?: Page;
}) {
  const { session } = useAuth();
  const pathname = usePathname();
  const isDeveloper = !!session?.permissions.includes("hr.accounts.manage");
  const items: NavItem[] = [
    ...(isDeveloper ? [{ href: "/", label: "Developer overview", short: "Overview", page: "forms" as Page, icon: LayoutDashboard }] : []),
    ...(session?.permissions.includes("employees.manage") ? [{ href: "/employees", label: "Employees", short: "Staff", page: "employees" as Page, icon: BriefcaseBusiness }] : []),
    ...(!isDeveloper ? [{ href: "/", label: session?.permissions.includes("profile.own") ? "My onboarding" : "Forms", short: session?.permissions.includes("profile.own") ? "Onboarding" : "Forms", page: "forms" as Page, icon: FileStack }] : []),
    ...(session?.permissions.includes("forms.manage") && !isDeveloper ? [{ href: "/packs", label: "Onboarding packs", short: "Packs", page: "packs" as Page, icon: PackageOpen }] : []),
  ];
  const onAccount = pathname?.startsWith("/account") ?? false;

  const navigation = (
    <nav aria-label="Main navigation" className="space-y-1.5 px-3">
      <p className="px-3 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-[0.17em] text-white/50">
        Workspace
      </p>
      {items.map(({ href, label, page, icon: Icon }) => {
        const selected = active === page && !onAccount;
        return (
          <Link
            key={href}
            href={href}
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

  const logoMark = (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-navy text-lg font-extrabold text-white shadow-sm">
      {brand.logoPath ? <img src={brand.logoPath} alt="" className="size-full object-contain bg-white" /> : brand.name.slice(0, 1)}
    </span>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside
        id="nolt-workspace-sidebar"
        aria-label="Workspace sidebar"
        className="hidden w-[260px] shrink-0 flex-col bg-navy text-white lg:sticky lg:top-0 lg:flex lg:h-dvh"
      >
        <div className="flex items-center justify-between gap-2 px-5 pb-6 pt-7">
          <Link href="/" aria-label={`${brand.name} ${brand.productName} home`} className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/95 text-xl font-extrabold text-navy shadow-sm">
              {brand.logoPath ? <img src={brand.logoPath} alt="" className="size-full object-contain" /> : brand.name.slice(0, 1)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-bold tracking-tight">{brand.name}</span>
              <span className="block text-xs text-white/60">{brand.productName}</span>
            </span>
          </Link>
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
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-white/95 px-4 shadow-sm backdrop-blur sm:px-7 lg:h-[72px] lg:px-9">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" aria-label={`${brand.name} ${brand.productName} home`} className="lg:hidden">{logoMark}</Link>
            <div className="min-w-0">
              <p className="hidden text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground sm:block">NOLT HR / Workspace</p>
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
        <main id="main-content" className="mx-auto w-full max-w-[1550px] min-w-0 flex-1 px-4 py-5 pb-32 sm:px-7 sm:py-8 sm:pb-32 lg:px-9 lg:pb-8">
          {children}
        </main>
      </div>
      {/* Phones and small tablets: floating bottom bar instead of a side menu. */}
      <nav
        aria-label="Main navigation"
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-stretch justify-around gap-1 rounded-3xl bg-navy/95 p-1.5 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur lg:hidden"
      >
        {items.map(({ href, short, page, icon: Icon }) => {
          const selected = active === page && !onAccount;
          return (
            <Link
              key={href}
              href={href}
              aria-current={selected ? "page" : undefined}
              className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 text-[11px] font-semibold transition-colors ${selected ? "bg-bright text-navy" : "text-white/75 active:bg-white/10"}`}
            >
              <Icon size={21} aria-hidden="true" />
              <span className="max-w-full truncate">{short}</span>
            </Link>
          );
        })}
        <Link
          href="/account"
          aria-current={onAccount ? "page" : undefined}
          className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 text-[11px] font-semibold transition-colors ${onAccount ? "bg-bright text-navy" : "text-white/75 active:bg-white/10"}`}
        >
          <UserRound size={21} aria-hidden="true" />
          <span>Account</span>
        </Link>
      </nav>
    </div>
  );
}
