"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, Loader2 } from "lucide-react";
import { api, errorMessage } from "@nolt/api-client";
import { useAuth } from "./auth-provider";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function AuthFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-primary p-12 text-white lg:flex">
        <Link href="/" className="text-2xl font-bold">
          NOLT <span className="font-normal opacity-70">People</span>
        </Link>
        <div className="max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">
            YOUR PEOPLE, YOUR PROCESS
          </p>
          <h1 className="mt-5 text-5xl font-semibold leading-tight tracking-tight">
            Every new chapter.
            <br />
            One secure workspace.
          </h1>
          <p className="mt-6 leading-7 opacity-80">
            Your forms, approvals and employee journey, protected by verified
            access.
          </p>
        </div>
        <p className="text-sm opacity-70">
          NOLT Finance · Employee lifecycle portal
        </p>
      </section>
      <section className="flex min-w-0 items-center justify-center p-5 sm:p-12">
        <div className="w-full max-w-md">
          <Link href="/" className="text-xl font-bold text-primary lg:hidden">
            NOLT People
          </Link>
          <span className="mt-8 inline-flex rounded-xl bg-accent p-3 text-primary lg:mt-0">
            <LockKeyhole size={24} />
          </span>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight">
            {title}
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
          {children}
        </div>
      </section>
    </main>
  );
}
export function AuthForm({ mode }: { mode: "login" | "signup" | "recovery" }) {
  const router = useRouter();
  const { session, loading } = useAuth();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null),
    [enabled, setEnabled] = useState(false);
  useEffect(() => {
    void api
      .GET("/api/v1/auth/config")
      .then((r) => {
        setEnabled(r.data?.enabled ?? false);
        if (!r.data?.enabled)
          setError("Sign-in is not available yet. Contact your administrator.");
      })
      .catch(() => setError("Could not connect. Please try again."));
  }, []);
  useEffect(() => {
    if (mode === "login" && !loading && session) router.replace("/");
  }, [mode, loading, session, router]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r =
        mode === "login"
          ? await api.POST("/api/v1/auth/login", { body: { email, password } })
          : mode === "signup"
            ? await api.POST("/api/v1/auth/signup", {
                body: { email, password, name },
              })
            : await api.POST("/api/v1/auth/recovery", { body: { email } });
      if (r.error || !r.data) throw new Error(errorMessage(r.error));
      if (r.data.next === "mfa") router.push("/auth/mfa");
      else {
        setNotice(
          r.data.message ??
            "Check your email and open the link in this browser.",
        );
        setPassword("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame
      title={
        mode === "login"
          ? "Welcome back"
          : mode === "signup"
            ? "Create your account"
            : "Reset your password"
      }
      description={
        mode === "login"
          ? "Sign in with your email, password and authenticator."
          : mode === "signup"
            ? "Verify your email and set up your authenticator to get started."
            : "We will email a recovery link. Your authenticator is still required to protect your account."
      }
    >
      {error && (
        <p
          role="alert"
          className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mt-5 rounded-lg bg-accent p-3 text-sm leading-6 text-primary"
        >
          {notice}
        </p>
      )}
      <form onSubmit={submit} className="mt-7 space-y-5">
        {mode === "signup" && (
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              autoComplete="name"
              required
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {mode !== "recovery" && (
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              required
              minLength={mode === "signup" ? 12 : 1}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "signup" && (
              <p className="text-xs text-muted-foreground">
                Use at least 12 characters.
              </p>
            )}
          </div>
        )}
        <Button
          type="submit"
          disabled={busy || !enabled}
          className="h-11 w-full"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {mode === "login"
            ? "Sign in"
            : mode === "signup"
              ? "Create account"
              : "Send recovery email"}
        </Button>
      </form>
      <div className="mt-6 flex flex-wrap justify-between gap-3 text-sm text-primary">
        {mode !== "login" && (
          <Link className="underline" href="/login">
            Back to sign in
          </Link>
        )}
        {mode === "login" && (
          <>
            <Link className="underline" href="/signup">
              Create an account
            </Link>
            <Link className="underline" href="/recovery">
              Forgot password?
            </Link>
          </>
        )}
      </div>
      <p className="mt-7 text-xs leading-5 text-muted-foreground">
        HR permissions are assigned separately. Creating an account does not
        grant access to HR records.
      </p>
    </AuthFrame>
  );
}
