# Guarantor and reference requests

The first increment delivered unsent recipient preparation. The next increment adds request queueing, replacement/revocation, provider email verification, MFA and a recipient workspace. Its acceptance results are recorded separately below and in the test report; code presence is not completion.

## Current requirement ? direct form invitation (D25)

The owner confirmed receipt of the first email, then rejected its staff-style MFA/signup experience. New guarantor/reference invitations use a simple direct Resend email with one **Open form** link. Opening the link verifies the intended email through real Supabase proof and immediately opens the form, with no password, signup screen or authenticator setup. The separate HttpOnly `nolt_external` cookie grants only one request, expires within 30 minutes and never establishes a staff session. Staff/employee MFA remains mandatory. Migration 014 adds hashed external email sessions with restricted grants, RLS, immutable binding and irreversible revocation. Updated direct-form acceptance passed locally against hosted Supabase (3.0 minutes), with no password/MFA setup for a new recipient. API/client/frontend builds, 36 unit/security checks and all 14 migration checksums/RLS/grants passed. Separate real staff password/TOTP/global-logout regression passed (32.5 seconds). The earlier MFA results below are historical prototype evidence.

The sender requires server-only `RESEND_API_KEY` and `RESEND_FROM_EMAIL`, saved locally by the owner. No secret goes into the frontend. The sender generates Supabase proof without sending Supabase's generic authentication email. Link proof stays in the URL fragment until exchanged and is immediately removed from browser history. Email verification proves access to the mailbox; it does not establish legal identity or prevent intentional forwarding. The email asks recipients not to forward their private link.

## Earlier MFA prototype ? superseded for new invitations

- Employees can queue only HR-designated GUARANTOR/REFERENCE assignments. Request creation snapshots the saved contact revision and exact immutable assignment. A repeated request key with different parameters fails; case locks serialise competing requests.
- The employee sees request delivery/submission status and their supplied recipient email, never respondent answers, provider credentials or an access link. Replacement retires the old request; submitted evidence cannot be replaced/revoked by the employee.
- Supabase Auth sends the verification email through the owner's SMTP integration. Supabase owns the one-time verification-token/hash lifecycle. The application does not generate or return a separate bearer request URL to employees. A provider proof alone is insufficient: the API matches the verified recipient, requires real MFA, then issues an opaque, database-hashed **one-request application session**.
- Request sessions have no ordinary employee/HR permissions. Session scope cannot be changed in the database. Every recipient read/write checks respondent identity, request expiry/revocation and active case status. URL verification parameters are removed immediately; recipient routes use no-store/no-referrer headers.
- Scoped cookies use an `external_` prefix on a cryptographically random opaque token; its full value is hashed in the database. Legacy APIs that accept only 64 hexadecimal characters reject this format. The current API requires token format and stored scope to agree; stripping the prefix changes the hash and cannot downgrade the session.
- The recipient can save/reopen a revision-checked text/choice response and submit an immutable snapshot directly for HR. Concurrent retries with the same submission key create one snapshot. Employee and technical/HR workspace sessions cannot act as the recipient.
- External attachments/signatures remain unavailable. The server rejects external file/signature references and blocks submissions requiring them. ClamAV deferral does not bypass this rule.

Development requests expire after 60 minutes; this is provisional test behaviour, not an approved production delivery/retention policy. The current increment supports one current request per assignment. Configurable multiple guarantor/reference slots and independent HR review/corrections remain pending.

## Delivery operation and verification boundary

The shared invitation worker checks the external delivery queue. Run `npm run worker:hosted` only when intending to process approved test deliveries; it is not started by the API. Development/staging delivery requires `EXTERNAL_TEST_RECIPIENTS` and existing Supabase backend/public provider configuration. No new paid service or worker deployment is provisioned by this increment.

Workers claim briefly with row locks/SKIP LOCKED, then contact the provider outside the transaction. Provider rate limits use bounded retry/backoff. Lost leases or uncertain provider outcomes are not automatically resent. Employee replacement creates a fresh request; a revoked/replaced link or already-open scoped session is denied. Automatic hosted worker operation and broader new/existing/unconfirmed-recipient resend acceptance remain release checks.

The owner approved one email to `exceldistrings@gmail.com` on 15 October and confirmed adding the local/canonical `/external/accept**` redirect allowlist entries. The one-off smoke helper restricts itself to that request and records the attempt before calling the provider. Inbox receipt/activation must be confirmed separately from provider acceptance. No delivery is claimed until its recorded result exists.

Final automated acceptance passed on 15 October: 32 unit/security tests, isolated database regressions, API/generated client and frontend builds, all 13 hosted migration checksums/security checks, contact browser regression (2.5 minutes) and the focused real-provider recipient journey (4.3 minutes). Recipient UI was checked at six widths, 200% CSS zoom and keyboard focus; the 320-pixel screenshot was reviewed. This is the compiled local application against hosted Supabase, not deployment of the new code to Railway/Vercel. Provider links in automated tests are genuine Supabase proofs; their email transport is an explicit fixture rather than inbox delivery.

Migration 012 adds request/delivery/submission records and session scope with restricted grants, RLS and integrity triggers. Migration 013 expands the existing AuthFlow kind allowlist: the first real browser run caught this missing constraint amendment. Applied migration 012 is preserved unchanged.

## Implemented contact preparation

- Employee checklist → typed OpenAPI client → guarded API → PostgreSQL `ExternalContactDraft` → transactional audit/outbox.
- `GET /api/v1/me/assignments/:id/external-contact` reads saved recipient details; `PUT` saves a name/email with `expectedRevision` (initially zero).
- Only the owning active employee on an active case can access details. Employee forms reject recipient preparation. Both the employment email and account email are excluded as recipient addresses; this is not proof of independent recipient identity.
- Case locking serialises competing updates. Stale saves return 409; the employee can reload saved details. The backend normalises email casing and rejects unexpected body properties.
- Database guards preserve the assignment binding, require the owning actor and enforce successive revisions. Public Supabase API roles have no table grants; the restricted backend retains its existing trusted-service access pattern.
- Audit metadata contains the revision only, without recipient contact details. `EXTERNAL_CONTACT_SAVED` is a domain event, not an email job; the invitation worker does not dispatch it.

Migration 011 is additive. Contact drafts are editable preparation, not immutable submitted guarantor evidence. No external response, token or signature is created by this increment.

## Remaining work

Complete and record current browser/delivery acceptance; authorised external HR review and correction cycles; multiple configured recipient slots; secure external files/signatures; final lifecycle/email/retention policy and hosted worker operation. Do not expose respondent answers or signing access to the employee.

Real recipient email tests require explicit approval of the test address. ClamAV is retained; live upload/signature acceptance is deferred by the owner. Required files/signatures must continue to block submission until scanning is operational and verified. Retention, independent identity verification rules and final HR/legal policy remain release gates.

Verification results belong in [the test report](TEST_REPORT.md) and [tracker](../TRACKER.md). Passing contact preparation does not complete the external-request milestone.
