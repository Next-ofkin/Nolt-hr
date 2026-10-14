# Employee invitations and activation

Implementation and acceptance date: 14 October 2026. Development project only. The owner confirmed receipt of the approved real email and successful activation. Hosted records independently confirm ACCEPTED, the intended employee link and one verified MFA factor. The real-account browser invitation journey also passed.

HR opens an employee's onboarding case, then uses Send invitation, Resend invitation or Revoke invitation. The API commits the invitation, request-idempotency evidence, audit event, outbox event and delivery job together. Resending explicitly replaces the previous invitation. There is one current invitation per employee; repeated requests with the same key/body return the same result and conflicting key reuse fails.

The sender uses Supabase Auth through the existing owner-managed Resend SMTP connection. New accounts receive Supabase's invitation email; existing verified employee accounts receive its magic-link email. Both redirect to `/invitations/accept?id=...`. Signup and password recovery retain their existing PKCE flows and email templates. Only the invitation redirect allowlist was added; SMTP settings were preserved.

The public invitation ID identifies the request and is not an authentication credential. Supabase verifies and consumes the one-time email proof; the application independently checks invitation state, expiry, intended verified email, linked employee identity and current membership. The landing page immediately clears email credentials from browser history. Provider tokens remain in encrypted, browser-bound server flow state; there is no browser Supabase client/local token storage. TOTP must establish signed AAL2 before activation. A new invitee chooses a password; an existing account keeps its password. Activation consumes the flow and commits the accepted invitation, audit/outbox and new application session atomically.

Revoked, expired, replaced or accepted invitations cannot activate again. Revocation affects the invitation; it does not deactivate an independently registered account or erase prior evidence. Account deactivation remains a separate operation. Existing own-record signup/account linking remains supported.

## Delivery operation

Password setup is determined by a private backend-only boolean lookup of whether the verified Auth account already has a password. An interrupted first setup still requires a password on a replacement invitation, even when email verification has already linked the employee. Password hashes are never returned to the application.

Run `npm run worker:hosted` alongside `npm run dev`. The worker claims jobs with a short transaction and skips rows locked by other workers; the email call runs outside the transaction. A provider rate-limit rejection backs off exponentially and stops after five attempts. Unknown network/provider failures and expired worker leases become UNCERTAIN instead of silently sending duplicate emails. HR can replace an uncertain invitation. Delivery status means provider/SMTP acceptance, not proven inbox delivery; actual inbox receipt and activation need recipient evidence.

Development delivery is restricted to the explicitly approved `INVITATION_TEST_RECIPIENTS` list in ignored `.env.supabase`. Keep the server-only `SUPABASE_SECRET_KEY` there too. Unapproved recipients fail safely without an email call. `INVITATION_TTL_MINUTES` defaults to 60 and currently accepts 5–60 minutes; provider email-proof expiry may be earlier. These are development security defaults, not a final HR reminder policy.

`EmployeeInvitation` and `InvitationDelivery` have RLS/backend-only grants. The runtime cannot delete them or alter audit records. Outbox payloads remain protected; only its operational `processedAt` column was granted UPDATE. No email credentials, provider tokens or raw one-time proofs are written to job/audit metadata.

## Verification boundaries

- Isolated PostgreSQL tests exercise idempotency, competing resends, revoked-link denial, expiry, revoke replay, exclusive job claims, approved-recipient enforcement and uncertain-lease recovery. A test-only failing email transport exercises the real SDK's rate-limit error parsing and committed five-attempt backoff/exhaustion. It does not simulate sign-in or claim successful email delivery.
- The real-account browser test generates a real Supabase invitation proof without mailing a disposable address. Transport acknowledgement is a database fixture in that test; real one-time proof, TOTP, password setup, activation and ownership are exercised against hosted Auth. Actual SMTP delivery is tested separately with the owner-approved inbox.
- `node scripts/invitation-smoke.mjs` sends at most one controlled invitation using private `INVITATION_SMOKE_EMAIL` and approved recipient settings. It preserves a stable request key in ignored `.local/qa/invitation-smoke.json`; rerunning it does not resend an already sent/accepted invitation. It uses the approved HR membership solely for this controlled development test.

Remaining production gates include shared throttling, production sender/recipient policy, worker hosting/monitoring, measured performance, privacy/retention, successful remote CI and explicit release approval. Form response drafts/submissions are the next feature slice. No real employee imports or production deployment are performed here.
