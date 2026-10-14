import { ForbiddenException, HttpException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Request, Response } from "express";

export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const privileged = (role: string) =>
  ["HR", "HR_REVIEWER", "SYSTEM_ADMIN"].includes(role);
const grants: Record<string, string[]> = {
  HR: ["forms.manage", "employees.manage", "reviews.assigned"],
  HR_REVIEWER: ["reviews.assigned"],
  EMPLOYEE: ["profile.own"],
  SYSTEM_ADMIN: ["system.manage"],
};
const extraPermissions = new Set(["health.read", "finance.read"]);
export function permissionsFor(user: { role: string; permissions: string[] }) {
  return [
    ...new Set([
      ...(grants[user.role] ?? []),
      ...user.permissions.filter((p) => extraPermissions.has(p)),
    ]),
  ];
}
export function localEnabled() {
  return (
    process.env.LOCAL_DEVELOPMENT === "true" &&
    process.env.NODE_ENV !== "production"
  );
}
export function appOrigin() {
  const url = new URL(process.env.PUBLIC_APP_URL ?? "http://127.0.0.1:3000");
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "PUBLIC_APP_URL must be an origin without a path or credentials.",
    );
  if (
    url.protocol !== "https:" &&
    !(
      localEnabled() &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new Error(
      "The application requires HTTPS outside explicit localhost development.",
    );
  return url.origin;
}
export const cookieName = (kind: "session" | "oidc" | "flow") =>
  `${process.env.NODE_ENV === "production" ? "__Host-" : ""}nolt_${kind}`;
export function cookie(req: Request, kind: "session" | "oidc" | "flow") {
  const key = cookieName(kind) + "=";
  return req.headers.cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(key))
    ?.slice(key.length);
}
export function setCookie(
  res: Response,
  kind: "session" | "oidc" | "flow",
  token: string,
  maxAge: number,
) {
  res.cookie(cookieName(kind), token, {
    httpOnly: true,
    secure: new URL(appOrigin()).protocol === "https:",
    sameSite: "lax",
    maxAge,
    path: "/",
  });
}
export function clearCookie(res: Response, kind: "session" | "oidc" | "flow") {
  res.clearCookie(cookieName(kind), {
    httpOnly: true,
    secure: new URL(appOrigin()).protocol === "https:",
    sameSite: "lax",
    path: "/",
  });
}
export function assertOrigin(req: Request) {
  if (req.headers.origin && req.headers.origin !== appOrigin())
    throw new ForbiddenException("Untrusted origin.");
  if (req.headers["sec-fetch-site"] === "cross-site")
    throw new ForbiddenException("Untrusted site.");
}
export class LoginLimiter {
  constructor(private limit = 60) {}
  private attempts = new Map<string, { count: number; until: number }>();
  take(key: string, now = Date.now()) {
    for (const [address, item] of this.attempts)
      if (item.until <= now) this.attempts.delete(address);
    const item = this.attempts.get(key) ?? { count: 0, until: now + 60_000 };
    if (
      item.count >= this.limit ||
      (!this.attempts.has(key) && this.attempts.size >= 10_000)
    )
      throw new HttpException(
        "Too many sign-in attempts. Try again shortly.",
        429,
      );
    item.count++;
    this.attempts.set(key, item);
  }
}
