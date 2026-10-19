# Invitation-based role assignment — Developer → HR → Employee

## Product rule
- A Developer may invite a new **HR** administrator. A completed, single-use
  Developer invitation assigns **HR** automatically only after email ownership,
  a verified Supabase TOTP AAL2 session, and a confirmed password.
- An HR administrator invites an **EMPLOYEE** through the existing employee
  onboarding invitation; this path does not grant HR or Developer access.
- The email/role sent by the browser is never authoritative. Invitation
  provenance, new-account subject, issuer, and inviter's Developer role are
  checked by the server and transactional database routine.
- Existing employees/accounts cannot be elevated through a new HR invitation.

## Controlled rollout — no existing data mutation by deploy
1. Merge approved code after unit tests, backend typecheck and security review.
2. Reconcile Supabase vs Prisma migration registries before running hosted
   migrations. The prior 20261019110000 provenance function was already applied
   through the Supabase migration channel.
3. Apply `20261019130000_auto_activate_verified_developer_hr` **once** using
   the chosen migration authority. It replaces the restricted, one-shot SQL
   function with Developer provenance/MFA checks and grants EXECUTE only to
   `nolt_app`. Do not run both Prisma and Supabase migration runners for it.
4. Verify the function's owner is `postgres`, trigger is unaffected, and
   its EXECUTE grant is **not** available to `PUBLIC`, `anon`,
   `authenticated` or `service_role`.
5. Keep `HR_INVITATION_AUTO_ACTIVATION_ENABLED` unset/false by default.
   Only set `true` after deployment, migration, tests, and permission review.
6. Verify a disposable fresh-address Developer invitation goes
   `SENT → ACCEPTED`, role `EMPLOYEE → HR` only upon a complete MFA+
   password flow. After login, HR permission routing must resolve to HR.
7. Verify the HR-created Employee invitation remains `EMPLOYEE`,
   and reject expired/revoked/mismatched/pre-existing invitations.
8. Never backfill, force-accept or directly promote a historical account.

## Interrupted HR invitation recovery
The existing invitation must still be `SENT` and unexpired. A previously
onboarded invitee with a password can reauthenticate through
`/hr-invitations/resume` and complete fresh MFA, after which the same atomic
activation function runs. Old `AuthFlow` records can expire and are not trusted.

## Failure handling
If activation is disabled, the password flow does not grant HR access and
presents pending activation with a retry action. API always fails closed.
A stored completed flow alone never grants HR—live provider AAL2 is checked
again before invoking the one-time database function.
