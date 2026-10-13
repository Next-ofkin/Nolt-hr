import Link from "next/link";
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
  active?: "forms" | "tracker";
}) {
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
            <Link
              href="/"
              className={`flex items-center gap-2 rounded-lg px-3 py-2 ${active === "forms" ? "bg-accent font-semibold text-primary" : "text-muted-foreground"}`}
            >
              <FileStack size={16} />
              Forms
            </Link>
            <Link
              href="/tracker"
              className={`flex items-center gap-2 rounded-lg px-3 py-2 ${active === "tracker" ? "bg-accent font-semibold text-primary" : "text-muted-foreground"}`}
            >
              <ClipboardList size={16} />
              Build tracker
            </Link>
          </nav>
          <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
            <ShieldCheck size={16} />
            <span>HR workspace</span>
            <span className="ml-2 flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-bold text-primary">
              HR
            </span>
          </div>
        </div>
      </header>
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs leading-5 text-amber-900">
        Local development · synthetic data only · managed login, signing and
        delivery are still being built{" "}
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
