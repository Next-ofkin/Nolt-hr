import { createClient } from "@supabase/supabase-js";
import { Logger } from "@nestjs/common";

const diagnosticLogger = new Logger("HrInvitationProvider");

/** Never log invitation addresses, URLs, bearer tokens, proof secrets or provider messages. */
export function hrProviderDiagnostic(error: { code?: string; status?: number; name?: string }): string {
  const code = /^[a-z0-9_]{1,64}$/i.test(error.code ?? "") ? error.code : "PROVIDER_REJECTED";
  const status = Number.isInteger(error.status) && error.status! >= 100 && error.status! <= 599 ? error.status : "unknown";
  const category = /^(AuthApiError|AuthUnknownError|AuthRetryableFetchError)$/.test(error.name ?? "") ? error.name : "OTHER";
  return `HR_INVITE_PROVIDER_FAILURE status=${status} code=${code} category=${category}`;
}

import { appOrigin } from "./security.js";
import { inviteEmail, inviteTtlMinutes, resendConfigured, sendViaResend } from "./invite-email.js";

export type HrDeliveryResult =
  | { status: "SENT"; providerSubject: string }
  | { status: "FAILED" | "UNCERTAIN"; errorCode: string; retryable: boolean };

export function hrRecipientAllowed(email: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.HR_INVITATION_DELIVERY_ENABLED !== "true") return false;
  // Delivery is authorised by the Developer-only, authenticated queue endpoint.
  // Do not require a per-recipient deployment setting: the Developer may invite
  // any previously unregistered, syntactically valid email address.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
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
  invitation: { id: string; email: string; name: string; creationSecret?: string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<HrDeliveryResult> {
  if (!invitation.creationSecret || !/^[a-f0-9]{64}$/.test(invitation.creationSecret))
    return { status: "FAILED", errorCode: "CREATION_PROOF_MISSING", retryable: false };
  if (!hrRecipientAllowed(invitation.email, env))
    return { status: "FAILED", errorCode: "DELIVERY_DISABLED_OR_INVALID_RECIPIENT", retryable: false };
  if (!env.SUPABASE_SECRET_KEY || !env.SUPABASE_URL)
    return { status: "FAILED", errorCode: "SENDER_NOT_CONFIGURED", retryable: false };
  // The admin API is not exposed to browsers. The recipient proves possession of email later.
  // Do not include administrator privileges in metadata supplied to Supabase.
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: "implicit" },
    global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(25000) }) },
  });
  try {
    const redirectTo = appOrigin() + "/hr-invitations/accept?id=" + encodeURIComponent(invitation.id);
    const data = { name: invitation.name, nolt_hr_creation_secret: invitation.creationSecret };
    // Branded path: Supabase only creates the account and the one-time proof; the
    // NOLT-branded email is sent through Resend. Without Resend settings we fall
    // back to Supabase's own invitation email so delivery never silently stops.
    const branded = resendConfigured(env);
    const result = branded
      ? await client.auth.admin.generateLink({ type: "invite", email: invitation.email, options: { redirectTo, data } })
      : await client.auth.admin.inviteUserByEmail(invitation.email, { redirectTo, data });
    if (result.error) {
      diagnosticLogger.warn(hrProviderDiagnostic({ code: result.error.code, status: result.error.status, name: result.error.name }));
      return hrDeliveryError(result.error.code, result.error.status);
    }
    // Require Supabase to identify the exact account it created for this invitation.
    // Do not mark as SENT without this binding; the caller must persist it first.
    const subject = result.data.user?.id;
    if (!subject || !/^[a-f0-9-]{36}$/i.test(subject))
      return { status: "UNCERTAIN", errorCode: "PROVIDER_SUBJECT_MISSING", retryable: false };
    if (result.data.user?.email?.trim().toLowerCase() !== invitation.email.trim().toLowerCase())
      return { status: "UNCERTAIN", errorCode: "PROVIDER_EMAIL_MISMATCH", retryable: false };
    if (branded) {
      const props = (result.data as { properties?: { hashed_token?: string; verification_type?: string } }).properties;
      if (!props?.hashed_token || props.verification_type !== "invite")
        return { status: "UNCERTAIN", errorCode: "PROOF_GENERATION_FAILED", retryable: false };
      const expiresAt = new Date(Date.now() + inviteTtlMinutes(env) * 60_000);
      const link = redirectTo + "#token_hash=" + encodeURIComponent(props.hashed_token) + "&type=invite";
      const failed = await sendViaResend(invitation.email, inviteEmail("HR", { name: invitation.name, link, expiresAt }), env);
      if (failed) {
        diagnosticLogger.warn(`HR_INVITE_EMAIL_FAILURE status=${failed.status} code=${failed.code}`);
        // The account exists at the provider, so never retry blindly and create duplicates.
        return { status: "UNCERTAIN", errorCode: failed.code, retryable: false };
      }
    }
    return { status: "SENT", providerSubject: subject };
  } catch {
    diagnosticLogger.warn("HR_INVITE_PROVIDER_FAILURE status=unknown code=DELIVERY_UNCERTAIN category=TRANSPORT");
    // Network timeouts leave uncertain delivery; do not blindly retry and create multiple links.
    return { status: "UNCERTAIN", errorCode: "DELIVERY_UNCERTAIN", retryable: false };
  }
}
