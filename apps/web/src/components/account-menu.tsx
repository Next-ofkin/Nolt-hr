"use client";
import Link from "next/link";
import { useAuth } from "./auth-provider";
export function AccountMenu() {
  const { session } = useAuth();
  return session ? (
    <Link
      href="/account"
      aria-label={session.name}
      className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-secondary"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-primary">
        {session.name
          .split(" ")
          .map((x) => x[0])
          .slice(0, 2)
          .join("")}
      </span>
      <span className="max-w-32 truncate">{session.name}</span>
    </Link>
  ) : (
    <Link href="/login" className="text-sm font-medium text-primary">
      Sign in
    </Link>
  );
}
