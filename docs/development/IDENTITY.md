# Supabase Auth and session integration

The owner selected real Supabase Auth on 13 October 2026. The synthetic identity provider and shortcut endpoint are removed. Old LOCAL/OIDC sessions are rejected; fixture accounts are deactivated without erasing historical forms/audit evidence.

## Account flow

- `/signup`: name, email and a password of at least 12 characters. Supabase sends the confirmation email through its configured SMTP service. No browser-supplied role or permission is accepted.
- Open the email in the browser that requested it. PKCE verifiers and one-time flow state remain encrypted in PostgreSQL behind an opaque HttpOnly cookie. `/auth/callback` exchanges the code and immediately clears it from browser history.
- New accounts are provisioned as EMPLOYEE by a private database trigger. User-editable metadata supplies display name only.
- The approved bootstrap HR email is stored privately in `.env.supabase` and the owner-only bootstrap table. After that exact email is verified, the trigger grants HR once and records audit/outbox evidence. Later handover is an explicit role administration task, not another public admin signup.
- `/login`: real Supabase email/password authentication. No workspace session is issued yet.
- `/auth/mfa`: enrol a TOTP authenticator if none is verified, or challenge the existing authenticator. A real six-digit code must establish signed `aal2` assurance before an application session is issued. MFA is required for all current roles.
- `/recovery`: request a Supabase recovery email. The browser-bound email flow still requires TOTP before saving a new password. Recovery never creates a workspace session; password change revokes all application/provider sessions and requires another login.
- Lost authenticator recovery requires an authorised administrator. Email recovery does not remove an existing MFA factor. Automated factor reset/recovery codes are not implemented.

## Sessions and access

The browser receives only an opaque HttpOnly application cookie and CSRF verification token. Supabase access/refresh tokens remain server-side, encrypted with AES-256-GCM and a persistent random 32-byte `AUTH_ENCRYPTION_KEY`. Do not rotate that key casually: existing provider session/flow ciphertext will become unreadable.

Application sessions retain the 30-minute idle and eight-hour absolute limits. Requests verify active membership, the current role/access version, authoritative provider user state, signed AAL2 claims, a verified TOTP factor and the actual provider session in `auth.sessions`. Provider-side revocation blocks access even while an access JWT would otherwise be unexpired. Refresh-token persistence is serialised by locking the application session row. Role/deactivation changes invalidate existing access; user metadata never controls permission decisions.

Provider proof calls during validation share a 12-second transport deadline. The serialized session transaction has a bounded 30-second deadline and 10-second pool wait. Provider unavailability and transaction/pool expiry return retryable 503 without authorising the request or updating session evidence; invalid/revoked credentials still fail authentication. This retains serialized refresh and authoritative revocation checks.

Creating the encrypted pre-MFA flow uses a 15-second transaction deadline and 10-second acquisition wait. Transaction expiry/pool timeout returns a sanitised retryable 503; no flow cookie is issued before persistence commits. This addresses a hosted-development acceptance failure where the default five-second transaction expired during sign-in. Authentication and MFA requirements are unchanged.

External recipient verification uses an encrypted EXTERNAL AuthFlow and real Supabase email proof/MFA before issuing a one-request Session. Its `externalRequestId` is immutable, ordinary workspace permissions are empty, and all recipient endpoints recheck the bound actor and request availability. Scoped opaque tokens have an `external_` prefix so an older deployed API rejects them; the prefix is included in the database/CSRF hashes and must agree with stored scope. Ordinary sessions retain their prior token format. See [external workflow](EXTERNAL_REQUESTS.md).

Default database transactions now have bounded 10-second acquisition and 15-second execution limits, matching the hosted workflow limits. Explicit longer session/file transaction deadlines remain in place. Form publishing/storage transaction failures return a sanitised retryable 503. This addresses an observed default acquisition timeout; it is not a load/performance acceptance claim.

Private `SECURITY DEFINER` functions have fixed empty search paths and no public API-role execution privileges. The provisioning trigger needs owner privileges to link `auth.users` to application identities; the session-check function exposes only an active-session boolean to the trusted backend. Runtime database credentials cannot change users or roles.

## Configuration

The default `npm run dev` and `npm run dev:hosted` load the real hosted environment. Both start the loopback API and web app; no fake provider runs on port 4100.

`.env` contains loopback transport settings. Ignored `.env.supabase` contains the project URL, publishable key, restricted/owner connection URLs, encryption key and approved bootstrap email. A server-only Auth key is available for explicitly invoked live-test administration; it never goes to browser code.

`npm run auth:setup` installs the hosting-specific private provisioning/session functions and bootstrap email. Portable schema migrations remain under `database/migrations`; migration 004 adds encrypted provider-session storage and expiring encrypted AuthFlow rows, enables RLS and retires fixture access. Do not repeat initial database bootstrap or introduce another migration history.

The reviewed Auth settings in `supabase/config.toml` use verified email, 12-character passwords, secure password changes, real TOTP enrolment/verification and local callback URLs. SMTP credentials are deliberately undeclared and remain managed in Supabase. Replace local origins with the approved HTTPS origins before deployment.

## Resend and verification gate

The owner will connect Resend directly to Supabase SMTP. The application does not use a separate Resend SDK or API key. Configure the verified sender and SMTP credentials in the hosted Auth dashboard. Keep default Supabase confirmation/recovery links compatible with PKCE; do not replace them with an implicit access-token link.

Real email delivery, confirmation-link exchange and recovery-link exchange must be exercised with the owner's mailbox after SMTP is connected. Live automated Auth tests create disposable provider accounts with administrative email confirmation; they prove password/TOTP/session behaviour, not email delivery. Their provider accounts are deleted and application identities deactivated after testing. They never alter the owner's account.

Production release still needs approved role administration, shared throttling, lost-factor recovery procedures, successful remote CI, HTTPS deployment and the remaining release gates. API production startup remains gated. Supabase's leaked-password protection warning requires separate Pro-plan consideration; no plan upgrade was performed.

References: [Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [TOTP MFA](https://supabase.com/docs/guides/auth/auth-mfa/totp), [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [password security](https://supabase.com/docs/guides/auth/password-security).


Owner acceptance, 13 October 2026: Resend SMTP email delivery, real signup/email confirmation and authenticator MFA are confirmed working by the owner. Password recovery and first HR bootstrap verification remain separate checks.

## External recipient amendment ? D25, 15 October 2026

Guarantors/references no longer use staff password/signup/MFA screens. They open the private invitation, exchange a real Supabase email proof and receive a separate `nolt_external` HttpOnly cookie for one request. This is verified-mailbox access, not authenticator assurance or legal identity verification. Staff SessionGuard still requires Supabase AAL2; an external cookie alone cannot authenticate any staff/employee endpoint. The new backend external guard checks token hash, active user/access version, recipient binding, expiry/revocation/replacement and CSRF. Mutation services additionally check active case and immutable assigned form. Legacy scoped MFA sessions remain historical records and are not issued by the new flow. Revised direct-form acceptance passed with real Supabase proof and a new recipient without MFA/password (3.0 minutes); staff password/TOTP/global-logout regression also passed (32.5 seconds). Updated real email delivery is still pending approval.
