# Developer → HR invitation rollout

## Current implemented slice (feature branch, not deployed)
Developer-only HR invitation **drafts**: a protected create/list/revoke API and dashboard form, audit/outbox events, a unique active draft per email, and a migration protected by RLS. Drafts **never send email, change a User's role, create a Supabase Auth account, or grant HR permissions**. The list shows only the latest 25 drafts for now.

## Lifecycle groundwork (pending, not applied to hosted database)
Migration `20261016120000_hr_invitation_lifecycle` introduces delivery states, expiry, request keys, recipient subject and acceptance metadata, plus constraints blocking duplicate pending email addresses and reactivation after revocation/acceptance. It performs no email delivery or role changes. Its isolated QA is in `npm run test:domain`. The migration is not yet applied and no send or acceptance endpoints are enabled.

## Required before invitations can be sent
- Add provider-verified invite delivery and confirmation with short-lived, single-use tokens.
- Bind verified Supabase Auth subject and confirmed recipient email to the exact invitation.
- Require successful, fresh TOTP MFA (aal2) *before* promoting the newly verified account, not merely a registered factor.
- Add transactional acceptance, locking, expiry, revocation, retries, idempotency, audit, and same-email collision checks; prevent promotion of any existing HR/employee/Developer account.
- Ensure no pending employee record can be linked by an unrelated HR invitation recipient; keep existing 1 HR, 4 employees, and unique Developer untouched.
- Add isolated full-flow DB and auth-provider tests plus permission denial checks, then review before hosted rollout.

## Release gate
The first draft migration `20261016100000_hr_invitation_drafts` is already applied. Do NOT run `npm run db:hosted:migrate` for `20261016120000_hr_invitation_lifecycle` until fresh local tests, backup review, and explicit approval. Never test drafts against real employees or existing HR emails. Do not manually promote accounts through SQL. No real invitations are dispatched by this branch.

## Verification policy checks (feature branch)
The pure `apps/api/src/hr-invitation-rules.ts` module rejects any acceptance without verified matching email, newly eligible identity, valid SENT/UNCERTAIN invitation, and actual MFA `aal2`. Its denial cases are covered by `tests/hr-invitation-rules.test.ts`. It is **not** yet wired to account promotion, email sending, or provider callbacks; these tests do not prove an end-to-end invitation. No production or hosted changes are authorized by this policy test alone.

## Queuing backend (feature branch only)
A Developer-protected `POST /api/v1/developer/hr-invitation-drafts/:id/queue` accepts `{requestKey: uuid}` and performs a locked, audited `DRAFT → QUEUED` transition, rejecting an email already used by either a User or Employee. This is intentionally **disabled by default** with `HR_INVITATION_DELIVERY_ENABLED` unset. Do not set this variable to `true` yet: there is no sender handling the new queue event and no HR activation endpoint. Queued does not mean sent. No production account role mutations are implemented.
