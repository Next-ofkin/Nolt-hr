import { createClient } from "@supabase/supabase-js";
import { appOrigin } from "./security.js";

export type HrDeliveryResult =
  | { status: "SENT"; providerSubject: string }
  | { status: "FAILED" | "UNCERTAIN"; errorCode: string; retryable: boolean };

export function hrRecipientAllowed(email: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.HR_INVITATION_DELIVERY_ENABLED !== "true") return false;
  const entries = (env.HR_INVITATION_TEST_RECIPIENTS ?? "")
    .split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
  // An explicit recipient list is mandatory until an independently reviewed launch.
  return entries.length > 0 && entries.includes(email.trim().toLowerCase());
}

export function hrDeliveryError(code: string | undefined, status: number | undefined): HrDeliveryResult {
  const safeCode = /^[a-z0-9_]{1,64}$/i.test(code ?? "") ? code! : "PROVIDER_REJECTED";
  return {
    status: !status || status >= 500 ? "UNCERTAIN" : "FAILED",
    errorCode: safeCode,
    retryable: status === 429,
  };
}

/** Transport only. Never changes a local role or marks an invitation accepted. */
export async function deliverHrInvitationEmail(
  invitation: { id: string; email: string; name: string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<HrDeliveryResult> {
  if (!hrRecipientAllowed(invitation.email, env))
    return { status: "FAILED", errorCode: "RECIPIENT_NOT_APPROVED", retryable: false };
  if (!env.SUPABASE_SECRET_KEY || !env.SUPABASE_URL)
    return { status: "FAILED", errorCode: "SENDER_NOT_CONFIGURED", retryable: false };
  // The admin API is not exposed to browsers. The recipient proves possession of email later.
  // Do not include administrator privileges in metadata supplied to Supabase.
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: "implicit" },
    global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(25000) }) },
  });
  try {
    const result = await client.auth.admin.inviteUserByEmail(invitation.email, {
      redirectTo: appOrigin() + "/hr-invitations/accept?id=" + encodeURIComponent(invitation.id),
      data: { name: invitation.name },
    });
    if (result.error) return hrDeliveryError(result.error.code, result.error.status);
    // Require Supabase to identify the exact account it created for this invitation.
    // Do not mark as SENT without this binding; the caller must persist it first.
    const subject = result.data.user?.id;
    if (!subject || !/^[a-f0-9-]{36}$/i.test(subject))
      return { status: "UNCERTAIN", errorCode: "PROVIDER_SUBJECT_MISSING", retryable: false };
    if (result.data.user?.email?.trim().toLowerCase() !== invitation.email.trim().toLowerCase())
      return { status: "UNCERTAIN", errorCode: "PROVIDER_EMAIL_MISMATCH", retryable: false };
    return { status: "SENT", providerSubject: subject };
  } catch {
    // Network timeouts leave uncertain delivery; do not blindly retry and create multiple links.
    return { status: "UNCERTAIN", errorCode: "DELIVERY_UNCERTAIN", retryable: false };
  }
}
