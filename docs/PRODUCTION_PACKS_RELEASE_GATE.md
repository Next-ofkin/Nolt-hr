# NOLT HR Production Packs: release gate (18 October 2026)

**Target:** existing Supabase project `llslubzdkdnvhbatmfug` (**Production**, contains real accounts). Preserve all existing rows, credentials, sessions, Storage objects and migration history.

## Read-only checks completed
- Project `Nolthr`: ACTIVE_HEALTHY, PostgreSQL 17, eu-west-1.
- `public`: 27 base tables; `_prisma_migrations`: 17 completed, 0 incomplete.
- Latest applied Prisma migration: `20261016100000_hr_invitation_drafts`; six Pack migrations `20261018100000` through `20261018150000` are not applied.
- Five required base tables present: `User`, `Form`, `FormVersion`, `FormAssignment`, `OnboardingCase`.
- `FormVersion_id_formId_key` composite unique index exists. `FormAssignment.dueDate` exists. `nolt_app` role exists.
- The Pack tables are absent, as expected. All six Pack SQL migration files are checked into the feature branch.

## Required before modifying Production (NOT satisfied yet)
1. Confirm a **fresh, recoverable logical PostgreSQL backup** made by an authorised operator using `pg_dump` or the Supabase CLI, kept privately outside GitHub. Supabase Free tier does not provide regular downloadable daily backups. Include roles/grants needed for restoration separately and consider Supabase Storage objects and Auth configuration. Verify the backup file exists, is nonempty and can be restored to a disposable database. **Do not share credentials or employee data in chat or GitHub.**
2. Review all six migrations on an isolated PostgreSQL database with current baseline migrations first. Confirm the exact migrator, grants/RLS, trigger and DB engine compatibility.
3. Confirm Production migration and API deployment window, application rollback plan and maintenance/communications; user authorisation to proceed is not a substitute for a verified backup.
4. Run the committed migration files through the repository's **Prisma migration tool** (`npm run db:migrate`) with the approved migration-owner connection, never individually through the Supabase MCP migration API. This preserves the existing Prisma `_prisma_migrations` lineage. Record the applied revisions without exposing secrets.
5. Read-only check migration history and Pack relations immediately after, then approve API release on `main`. Do not merge solely to trigger a deployment while DB is unprepared.
6. Verify access/permissions as HR vs employee, forms/Pack lifecycle, MFA, submissions and approvals. Address 11 previously reported high-severity npm audit findings before wider launch.

## Safe operator backup reference
See [Supabase Backups documentation](https://supabase.com/docs/guides/platform/backups). Run backup using the supported CLI with **secure credentials configured outside the repo**. A SQL editor export of table schemas or a screenshot is **not** a verified, restorable full backup. Test restoration separately.

**Current decision:** Hold Production migrations and merges pending verified backup. Continue code review and local verification without requiring a new paid service.
