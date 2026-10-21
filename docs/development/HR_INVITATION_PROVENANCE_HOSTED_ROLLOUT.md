> Note (21 October 2026): references to Railway and Vercel in this page describe the earlier hosting. The app now runs on a VPS ([DEPLOYMENT.md](../DEPLOYMENT.md)). The behaviour described otherwise still applies unless the tracker says it changed.

# HR invitation provenance trigger — hosted rollout checklist (2026-10-19)

## Why
Hosted nolt_private.provision_auth_user() does not bind public."HrInvitation"."creationSubject" on auth.users INSERT. An invitation email created an Auth identity but ledger correctly left its invitation UNCERTAIN/CREATION_PROVENANCE_MISMATCH. Sending and acceptance were disabled on Railway until corrected.

## Preflight and scope
1. Keep HR_INVITATION_DELIVERY_ENABLED=false and HR_INVITATION_ACCEPTANCE_ENABLED=false until independent review and migration verification.
2. Verify 20261016120000_hr_invitation_lifecycle migration is installed, zero QUEUED/SENDING invites, trigger nolt_auth_user_provision already points at nolt_private.provision_auth_user(), and database backup/restore plan is available.
3. Review database/migrations/20261019110000_hr_invitation_auth_provenance/migration.sql against database/supabase-auth-provisioning.sql. It changes one SECURITY DEFINER trigger **function**, not table schema, role grants, active users or trigger attachment. Do not run twice using different migration registries.
4. For normal repo deploy use the existing project's documented hosted Prisma migration runner, after merging PR. Do **not** simultaneously run Supabase MCP apply_migration and Prisma for the same SQL; they maintain different migration histories.

## Proof and validation
- Existing users/identities retain their IDs and roles.
- Only INSERT on auth.users with an exact server-issued nolt_hr_creation_secret, matching lowercase email, state SENDING, null creationSubject, and SHA-256 digest equal to creationSecretHash may bind creationSubject. UPDATE cannot claim it, and email alone is insufficient.
- Verify deployed function with pg_get_functiondef('nolt_private.provision_auth_user()'::regprocedure), its owner, and its trigger attachment. Negative tests on disposable database: wrong hash, preexisting account, UPDATE replay, different email, expired/failed invitation, duplicate claims. Tests must never modify real Auth accounts.
- With user-authorised fresh mailbox on allowlist, create exactly one draft/send and ensure ledger marks SENT with matching creationSubject/providerSubject. Verify email and MFA independently. HR promotion still requires separate owner/operator approval and runner.

## Already-invited address
The first test recipient now has an Auth identity but no matching invitation provenance; keep its UNCERTAIN invitation as historical evidence. **Do not** backfill creationSubject from email or metadata after creation, retry the old link, delete the user, or manually promote HR. New invite to this address is intentionally blocked. Use a fresh mailbox for an end-to-end test or an explicitly reviewed recovery mechanism.

## Rollback
If the new trigger fails, keep delivery/acceptance disabled. Restore the previously captured function definition through a separately reviewed migration. No automated account deletion, role changes or invitation-state rewriting.
