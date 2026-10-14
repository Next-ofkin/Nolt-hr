"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "./auth-provider";
import { Button } from "./ui/button";
export function WorkspaceAccess({
  children,
  permission = "forms.manage",
}: {
  children: React.ReactNode;
  permission?: string;
}) {
  const { session, loading, error, refresh } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !session && !error) router.replace("/login");
  }, [session, loading, error, router]);
  if (loading)
    return (
      <p className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 size={18} className="animate-spin" />
        Verifying your session…
      </p>
    );
  if (error)
    return (
      <div role="alert" className="space-y-4 rounded-xl border bg-white p-6">
        <p>{error}</p>
        <Button onClick={() => void refresh()}>Try again</Button>
      </div>
    );
  if (!session) return null;
  if (!session.permissions.includes(permission))
    return (
      <section className="mx-auto max-w-xl rounded-xl border bg-white p-8">
        <ShieldCheck className="text-primary" />
        <h1 className="mt-4 text-2xl font-semibold">Welcome, {session.name}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Your account is signed in. This workspace requires a permission your
          account does not have. Your account settings remain available below.
        </p>
        <Link
          href="/account"
          className="mt-5 inline-block text-sm font-medium text-primary underline"
        >
          View your account
        </Link>
      </section>
    );
  return children;
}
