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

## Delivery transport module (not wired, no sending enabled)
`apps/api/src/hr-invitation-delivery.ts` encapsulates Supabase Auth admin invitation delivery with explicit `HR_INVITATION_DELIVERY_ENABLED=true` **and** `HR_INVITATION_TEST_RECIPIENTS` matching the address. It is NOT connected to queue workers or API routes yet; it cannot send any emails until reviewed integration code is added. It does not grant roles or consume invitations. Missing approved recipient, missing sender configuration, and uncertain network outcomes fail closed. Unit tests use disabled/unapproved recipients and make no provider requests. The landing path `/hr-invitations/accept` is reserved and does not yet exist; do not enable sending.

## Read-only provider identity proof (feature branch)
`apps/api/src/hr-invitation-proof.ts` is an isolated proof service (no route registered) that verifies a live Supabase session, `aal2` TOTP, confirmed email, exact Auth subject / provisional NOLT identity match, absence of an Employee record, invitation state/expiry, and provider-session liveness. It intentionally returns `activationAllowed: false` because the pre-existing-user/just-provisioned-user distinction is not yet proven. **It must not be treated as permission to promote**. Before integration, persist and atomically bind an invitation-created provider subject (fresh Auth identity) to the invitation, then revalidate under an acceptance lock and prevent competing signups. No real invitations, queue-worker sends or role writes are enabled.

## Provider subject binding (feature branch, not live)
The Supabase delivery adapter now returns the provider's exact newly invited user ID on a successful response, and fails closed if the user ID is absent or the returned email differs. The read-only HR proof requires an invitation-persisted `providerSubject` matching the active Supabase subject. The pure policy also denies missing/mismatched subjects; unit tests cover both cases. **This is not yet end-to-end**: the worker that atomically persists the provider subject is not connected and the account activation transaction is not implemented. Do not enable sending or migrate hosted Supabase until those are built, tested and reviewed. The initial provisional employee identity from the Auth trigger needs fresh-account provenance protection beyond matching email.

## Delivery outcome ledger (not connected to worker)
`apps/api/src/hr-invitation-ledger.ts` atomically records a provider response only for an invitation locked in `SENDING`. Success persists the exact provider subject and `SENT` timestamp; failures save the classified delivery result. Both emit audit/outbox records. A replay does not update an already processed invitation. The pending lifecycle migration now uniquely indexes **all** non-null provider subjects across HR invitations. The disposable PostgreSQL domain test uses a fabricated provider result, performs no network/email calls and verifies single-use persistence and no role change. This does not authenticate a recipient, send an email or provision/activate HR. It is not registered with the queue worker. **Do not apply the pending hosted migration or enable delivery until the end-to-end launch gate is satisfied.**

## Pending migration correction
The isolated delivery-ledger domain test exposed an acceptance constraint that wrongly prohibited a provider subject on a SENT invitation. The **unapplied** lifecycle migration now allows a provider subject to be recorded before ACCEPTED, while still requiring subject, acceptedAt and acceptedBy on ACCEPTED. A regression test rejects premature ACCEPTED state. This migration remains unapproved for hosted deployment.

## Disabled-by-default worker wiring (feature branch)
The NestJS queue worker now invokes `HrInvitationWorker.deliverNext()`, which **returns immediately without accessing the DB or provider** while `HR_INVITATION_DELIVERY_ENABLED` is not `true`. Once fully approved, it claims one QUEUED row using `FOR UPDATE SKIP LOCKED`, rechecks approved-recipient, expiry, User and Employee collisions, then calls the separate Supabase transport after committing the claim and records the result through the delivery ledger. `SENDING` is never automatically retried/reclaimed because a provider call may have succeeded before a crash. **Do not enable this gate**: there is still no activation endpoint or recipient landing route, pre-existing Supabase Auth identities may be untracked in NOLT, and the complete end-to-end tests/release review are pending. The hosted migration remains unapplied.

## Concurrent worker integration test
The isolated domain suite now launches two `HrInvitationWorker` instances concurrently against disposable PostgreSQL. A test-only subclass replaces the external email call with a synthetic result and verifies exactly one sender invocation, a single claimed attempt, persisted provider-subject binding, and unchanged User role. No Supabase request or email occurs. This provides claim/concurrency coverage **only**; it does not test provider-delivery races with signups or complete MFA activation, and does not authorise enabling the delivery flag.

## Atomic revocation hardening
The Developer revoke action now locks the invitation row before inspecting its state. Already accepted invitations return a conflict instead of allowing a role-irrelevant revocation. Repeated revoke of an already revoked draft is a no-op, with no duplicate audit. A new disposable PostgreSQL regression test checks these properties. This prevents a race with delivery and is a prerequisite for the future locked, one-time acceptance implementation. It does not enable acceptance, provider sending, or hosted migration.

## Fresh-account provenance gate for HR acceptance
The activation policy now requires `freshInvitationIdentity === true` **in addition to** matching provider subject, confirmed email and MFA AAL2. Read-only identity verification has been split into `canVerifyHrInvitationIdentity` and does not imply permission to promote. No caller can currently supply trusted fresh-invitation provenance: it must be implemented as a server-controlled creation claim tied atomically to a new Supabase Auth account, rather than inferred from email or metadata alone. Tests assert identity checks may pass while activation remains denied. No activation endpoint or role mutation was added, and live delivery and the hosted migration remain disabled.
