"use client";
import Link from "next/link";
import { useAuth } from "./auth-provider";
import { AccountMenu } from "./account-menu";
import {
  ArrowUpRight,
  ClipboardList,
  FileStack,
  ShieldCheck,
} from "lucide-react";
export function WorkspaceShell({
  children,
  active = "forms",
}: {
  children: React.ReactNode;
  active?: "forms" | "tracker" | "employees";
}) {
  const { session } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8 lg:px-10">
          <Link
            href="/"
            className="flex items-center gap-3"
            aria-label="NOLT HR home"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-xl font-bold text-white">
              N
            </span>
            <span className="text-xl font-bold tracking-tight">
              NOLT
              <span className="ml-2 border-l pl-2 text-sm font-normal text-muted-foreground">
                People
              </span>
            </span>
          </Link>
          <nav aria-label="Main navigation" className="flex gap-1 text-sm">
            {session?.permissions.includes("employees.manage") && (
              <Link
                href="/employees"
                className={`rounded-lg px-3 py-2 ${active === "employees" ? "bg-accent font-semibold text-primary" : "text-muted-foreground"}`}
              >
                Employees
              </Link>
            )}
            <Link
              href="/"
              className={`flex items-center gap-2 rounded-lg px-3 py-2 ${active === "forms" ? "bg-accent font-semibold text-primary" : "text-muted-foreground"}`}
            >
              <FileStack size={16} />
              {session?.permissions.includes("profile.own")
                ? "My onboarding"
                : "Forms"}
            </Link>
            <Link
              href="/tracker"
              className={`flex items-center gap-2 rounded-lg px-3 py-2 ${active === "tracker" ? "bg-accent font-semibold text-primary" : "text-muted-foreground"}`}
            >
              <ClipboardList size={16} />
              Build tracker
            </Link>
          </nav>
          <AccountMenu />
        </div>
      </header>
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs leading-5 text-amber-900">
        Development workspace · HR review, signing and third-party requests are
        being built{" "}
        <Link
          href="/tracker"
          className="inline-flex items-center gap-1 underline underline-offset-2"
        >
          View progress
          <ArrowUpRight size={12} />
        </Link>
      </div>
      <main className="mx-auto max-w-[1600px] px-4 py-7 sm:px-8 sm:py-9 lg:px-10">
        {children}
      </main>
    </div>
  );
}
