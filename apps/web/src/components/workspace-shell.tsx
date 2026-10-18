"use client";
import Link from "next/link";
import { useAuth } from "./auth-provider";
import { AccountMenu } from "./account-menu";
import { brand } from "@/lib/brand";
import {
  ArrowUpRight,
  ClipboardList,
  FileStack,
  PackageOpen,
  LayoutDashboard,
} from "lucide-react";
export function WorkspaceShell({
  children,
  active = "forms",
}: {
  children: React.ReactNode;
  active?: "forms" | "tracker" | "employees" | "packs";
}) {
  const { session } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8 lg:px-10">
          <Link
            href="/"
            className="flex items-center gap-3"
            aria-label={`${brand.name} ${brand.productName} home`}
          >
            <span className="flex size-10 items-center justify-center overflow-hidden rounded-xl bg-primary text-xl font-bold text-white">
              {brand.logoPath ? <img src={brand.logoPath} alt="" className="size-full object-contain" /> : brand.name.slice(0,1)}
            </span>
            <span className="text-xl font-bold tracking-tight">
              {brand.name}
              <span className="ml-2 border-l pl-2 text-sm font-normal text-muted-foreground">
                {brand.tagline}
              </span>
            </span>
          </Link>
          <nav aria-label="Main navigation" className="flex gap-1 text-sm">
            {session?.permissions.includes("hr.accounts.manage") && (
              <Link href="/" aria-current={active === "forms" ? "page" : undefined} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${active === "forms" ? "bg-accent font-semibold text-primary" : "text-muted-foreground"}`}><LayoutDashboard size={16}/> Developer overview</Link>
            )}
            {session?.permissions.includes("employees.manage") && (
              <Link
                href="/employees"
                className={`rounded-lg px-3 py-2 ${active === "employees" ? "bg-accent font-semibold text-primary" : "text-muted-foreground"}`}
              >
                Employees
              </Link>
            )}
            {!session?.permissions.includes("hr.accounts.manage") && <Link
              href="/"
              className={`flex items-center gap-2 rounded-lg px-3 py-2 ${active === "forms" ? "bg-accent font-semibold text-primary" : "text-muted-foreground"}`}
            >
              <FileStack size={16} />
              {session?.permissions.includes("profile.own")
                ? "My onboarding"
                : "Forms"}
            </Link>}
            {session?.permissions.includes("forms.manage") && !session?.permissions.includes("hr.accounts.manage") && (
              <Link href="/packs" aria-current={active === "packs" ? "page" : undefined}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 ${active === "packs" ? "bg-accent font-semibold text-primary" : "text-muted-foreground"}`}>
                <PackageOpen size={16} /> Packs
              </Link>
            )}
            {!session?.permissions.includes("hr.accounts.manage") && <Link
              href="/tracker"
              className={`flex items-center gap-2 rounded-lg px-3 py-2 ${active === "tracker" ? "bg-accent font-semibold text-primary" : "text-muted-foreground"}`}
            >
              <ClipboardList size={16} />
              Build tracker
            </Link>}
          </nav>
          <AccountMenu />
        </div>
      </header>
      {!session?.permissions.includes("hr.accounts.manage") && <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs leading-5 text-amber-900">
        Development workspace · HR review, signing and third-party requests are
        being built{" "}
        <Link
          href="/tracker"
          className="inline-flex items-center gap-1 underline underline-offset-2"
        >
          View progress
          <ArrowUpRight size={12} />
        </Link>
      </div>}
      <main className="mx-auto max-w-[1600px] px-4 py-7 sm:px-8 sm:py-9 lg:px-10">
        {children}
      </main>
    </div>
  );
}
