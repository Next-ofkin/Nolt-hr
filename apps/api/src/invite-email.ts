/**
 * One branded email layout for every NOLT invitation (HR, employee, guarantor/reference).
 * Sent through Resend when RESEND_API_KEY and RESEND_FROM_EMAIL are configured.
 * Never log addresses, links or tokens from this module.
 */
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type InviteKind = "HR" | "EMPLOYEE" | "EXTERNAL";

/** Invitation lifetime in minutes. One setting for every invite type. Supabase's own
 *  "Email OTP expiration" (Auth settings, max 24h) must be at least this long. */
export function inviteTtlMinutes(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.INVITATION_TTL_MINUTES;
  const minutes = raw === undefined || raw === "" ? 60 : Number(raw);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440)
    throw new Error("Invitation expiry configuration is invalid.");
  return minutes;
}

/** Human wording for the lifetime, e.g. "60 minutes", "24 hours". */
export function ttlWords(minutes: number): string {
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return h === 1 ? "1 hour" : `${h} hours`;
  }
  return `${minutes} minutes`;
}

/** Expiry in Nigerian time (WAT, UTC+1), e.g. "Wed, 21 Oct 2026, 3:45 PM (WAT)". */
export function lagosTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).formatToParts(date);
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${p("weekday")}, ${p("day")} ${p("month")} ${p("year")}, ${p("hour")}:${p("minute")} ${p("dayPeriod").toUpperCase()} (WAT)`;
}

type Copy = { subject: string; heading: string; intro: (name: string, title: string) => string; button: string; steps: string[]; note: string };
const copy: Record<InviteKind, Copy> = {
  HR: {
    subject: "You're invited to join NOLT HR",
    heading: "Welcome to NOLT HR",
    intro: (name) => `Hello ${name}, you have been invited to join the NOLT Finance HR team. Your access is set up once you confirm your email, choose a password and add an authenticator app.`,
    button: "Accept invitation",
    steps: ["Confirm your email with the button below.", "Choose a strong password.", "Add an authenticator app (Google Authenticator, Microsoft Authenticator or similar)."],
    note: "Only you can use this link. NOLT will never ask for your password by email.",
  },
  EMPLOYEE: {
    subject: "Your NOLT HR onboarding is ready",
    heading: "Your onboarding is ready",
    intro: (name) => `Hello ${name}, NOLT Finance has set up your onboarding. Please sign in to complete your forms and documents.`,
    button: "Start onboarding",
    steps: ["Confirm your email with the button below.", "Set your password if asked.", "Complete the forms assigned to you."],
    note: "Only you can use this link. NOLT will never ask for your password by email.",
  },
  EXTERNAL: {
    subject: "NOLT Finance has asked you to complete a form",
    heading: "A form is waiting for you",
    intro: (_name, title) => `NOLT Finance has asked you to complete: ${title}. This takes only a few minutes and your answers go directly to the HR team.`,
    button: "Open form",
    steps: ["Confirm your email with the button below.", "Complete every section yourself.", "Submit the form."],
    note: "Please do not forward this email. The link is personal to you.",
  },
};

export function inviteEmail(kind: InviteKind, input: { name?: string; title?: string; link: string; expiresAt: Date }) {
  const c = copy[kind];
  const name = (input.name ?? "").trim() || "there";
  const title = (input.title ?? "").trim() || "a form";
  const intro = c.intro(name, title);
  const expiry = lagosTime(input.expiresAt);
  const text = [
    c.heading, "", intro, "", "What to expect:", ...c.steps.map((s, i) => `${i + 1}. ${s}`), "",
    `${c.button}: ${input.link}`, "", `This link expires on ${expiry}.`, c.note,
    "", "NOLT Finance - a CBN-licensed lender and investment firm.",
  ].join("\n");
  const steps = c.steps
    .map((s, i) => `<tr><td style="vertical-align:top;padding:0 12px 10px 0"><span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:11px;background:#e6f1fd;color:#0b63ce;font-size:12px;font-weight:700">${i + 1}</span></td><td style="padding:0 0 10px;font-size:14px;line-height:1.5;color:#334155">${esc(s)}</td></tr>`)
    .join("");
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f3f6fb">
<div style="display:none;max-height:0;overflow:hidden;color:#f3f6fb">${esc(c.heading)} - this link expires ${esc(expiry)}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fb;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<tr><td style="background:#010b2f;padding:22px 28px"><span style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:#ffffff">NOLT</span><span style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:#2aa3fc"> Finance</span></td></tr>
<tr><td style="padding:30px 28px 8px"><h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#010b2f">${esc(c.heading)}</h1><p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155">${esc(intro)}</p></td></tr>
<tr><td style="padding:0 28px"><table role="presentation" cellpadding="0" cellspacing="0" style="background:#f3f6fb;border-radius:12px;padding:16px 16px 6px;width:100%"><tr><td colspan="2" style="padding:0 0 10px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b">What to expect</td></tr>${steps}</table></td></tr>
<tr><td style="padding:24px 28px 8px"><a href="${esc(input.link)}" style="display:inline-block;background:#0b63ce;color:#ffffff;text-decoration:none;padding:13px 30px;border-radius:10px;font-weight:700;font-size:15px">${esc(c.button)}</a></td></tr>
<tr><td style="padding:12px 28px 4px"><p style="margin:0;font-size:13px;line-height:1.6;color:#475569">This link expires on <strong>${esc(expiry)}</strong>. If the button does not work, copy this address into your browser:</p><p style="margin:6px 0 0;font-size:12px;line-height:1.5;word-break:break-all;color:#0b63ce">${esc(input.link)}</p></td></tr>
<tr><td style="padding:20px 28px 28px"><hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 14px"><p style="margin:0;font-size:12px;line-height:1.6;color:#64748b">${esc(c.note)} If you were not expecting this email, you can safely ignore it.</p><p style="margin:10px 0 0;font-size:12px;color:#94a3b8">NOLT Finance - a CBN-licensed lender and investment firm.</p></td></tr>
</table></td></tr></table></body></html>`;
  return { subject: c.subject, text, html };
}

export function resendConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL);
}

/** Returns null on success, or a short safe error code. */
export async function sendViaResend(
  to: string,
  message: { subject: string; text: string; html: string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ code: string; status: number } | null> {
  try {
    const result = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(25000),
      headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.RESEND_FROM_EMAIL, to: [to], ...message }),
    });
    if (!result.ok) return { code: "EMAIL_PROVIDER_REJECTED", status: result.status };
    return null;
  } catch {
    return { code: "DELIVERY_UNCERTAIN", status: 0 };
  }
}
