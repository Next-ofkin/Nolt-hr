# NOLT HR Production Packs: release gate

**Status: historical. Completed.** This page recorded the checks needed before the Packs migrations touched production on 18 October 2026. The migrations have since been applied, and later ones as well.

## Where production is now (read-only check, 21 October 2026)
- Supabase project `Nolthr` (`llslubzdkdnvhbatmfug`), PostgreSQL 17.
- 32 applied Prisma migrations, none incomplete, the latest `20261021100000_form_and_pack_lifecycle`.
- 32 application tables in `public` plus `_prisma_migrations`, including the Pack tables.
- Active accounts: 1 DEVELOPER, 4 HR, 6 EMPLOYEE.

## What the gate required, and what is still open
| Requirement | State |
|---|---|
| Review migrations on an isolated database first | Done in development before each migration |
| Apply through the Prisma migration owner connection, not individually through other tools | Earlier migrations used Prisma. The most recent ones were applied through the Supabase tool; their records are in `_prisma_migrations` (see [handover](NOLT_DEVELOPER_HANDOVER.md)) |
| Read-only checks after each migration | Done |
| **Fresh, restorable backup before changes** | **Not verified.** The owner has chosen to keep the project simple. Check Supabase → Database → Backups and keep periodic exports. A table screenshot is not a backup |
| Address high-severity npm audit findings before wider launch | Open: re-run `npm audit` before real users are onboarded |

## Rules that still apply
- Never drop or recreate production tables, and never delete `_prisma_migrations` to force a rerun.
- Back up and review before any data deletion. Evidence tables are protected by triggers on purpose.
- Backup reference: [Supabase backups](https://supabase.com/docs/guides/platform/backups).
