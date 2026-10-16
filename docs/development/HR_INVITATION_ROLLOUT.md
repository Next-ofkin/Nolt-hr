# Developer → HR invitation rollout

## Current implemented slice (feature branch, not deployed)
Developer-only HR invitation **drafts**: a protected create/list/revoke API and dashboard form, audit/outbox events, a unique active draft per email, and a migration protected by RLS. Drafts **never send email, change a User's role, create a Supabase Auth account, or grant HR permissions**. The list shows only the latest 25 drafts for now.

## Required before invitations can be sent
- Add provider-verified invite delivery and confirmation with short-lived, single-use tokens.
- Bind verified Supabase Auth subject and confirmed recipient email to the exact invitation.
- Require successful, fresh TOTP MFA (aal2) *before* promoting the newly verified account, not merely a registered factor.
- Add transactional acceptance, locking, expiry, revocation, retries, idempotency, audit, and same-email collision checks; prevent promotion of any existing HR/employee/Developer account.
- Ensure no pending employee record can be linked by an unrelated HR invitation recipient; keep existing 1 HR, 4 employees, and unique Developer untouched.
- Add isolated full-flow DB and auth-provider tests plus permission denial checks, then review before hosted rollout.

## Release gate
Do NOT run `npm run db:hosted:migrate` for `20261016100000_hr_invitation_drafts` until local tests, reviewed backup, and explicit approval. Never test drafts against real employees or existing HR emails. Do not manually promote accounts through SQL. No real invitations are dispatched by this branch.
