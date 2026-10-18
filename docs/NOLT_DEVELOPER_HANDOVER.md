# NOLT HR — Forms & Packs developer handover

**Status:** source-code implementation in progress, **not release-ready**. This guide is for the NOLT development team. No production database reset, hosted migration, or deployment is authorised by this file.

## Source of truth
- Default release branch: `main`. Integration: `develop`. Current pending Forms, Packs and authentication work: `feat/developer-hr-employee-auth` under draft PR #6.
- Central delivery ledger: `docs/TRACKER.md` (on `develop`).
- Backend: `apps/api`; frontend: `apps/web`; Prisma schema: `database/schema.prisma`; versioned SQL: `database/migrations`.
- Core HR Pack endpoints: `GET /api/v1/packs`, `GET /api/v1/packs/:id`, `POST /api/v1/packs`, `PUT /api/v1/packs/:id`, `POST /api/v1/packs/:id/publish`, `POST /api/v1/packs/:id/versions`, `POST /api/v1/packs/:id/assign`, `GET /api/v1/packs/cases/:caseId`, `POST /api/v1/packs/assignments/:id/approve`, `POST /api/v1/packs/assignments/:id/extend-deadline`, `GET /api/v1/me/packs`.

## Migration sequence
The Packs migrations are additive and intended for an **isolated, disposable PostgreSQL database first**:
1. `20261018100000_pack_templates`
2. `20261018110000_pack_assignments`
3. `20261018120000_pack_approval`
4. `20261018130000_pack_deadline_history`
5. `20261018140000_pack_version_lineage`
6. `20261018150000_pack_immutability`

Apply **all prerequisite application migrations in folder order** before these. Do not silently edit checksums of migrations already applied to any environment. Compare the current Prisma migration table and checksums before the release and reconcile mismatches with a reviewed plan. Verify grants/RLS against the deployment role. Never delete `_prisma_migrations` to force a rerun.

## Developer validation gate (Node 24)
From the repository root, with project-specific local environment configured:
```sh
npm ci
npm run db:generate
npm run typecheck
npm test
npm run build
```
Then run migrations against a **new disposable database**, verify `prisma migrate status`, and perform real HTTP/API browser checks for:
- Create, edit, publish, new version; old published content and assignments remain unchanged.
- Published FormVersion ownership and recipient checks; outdated Pack versions blocked for new assignments.
- Create/open an employee onboarding case, assign a pack, prevent duplicates, verify case revision.
- Employee sees only their own Packs and assigned forms; no cross-employee data.
- Existing form submissions and reviewer decisions determine **required form** readiness; submitted does not equal approved.
- Only authorised HR can approve; two simultaneous approvals do not both succeed.
- Overdue dates and justified extensions update linked form due dates and preserve audit trail.
- Guarantor/reference completion and review permissions, external submission flows, and necessary security scanning.
- Existing six active Production users and dependent data are preserved by any rollout.

**No full passing results are claimed:** code editing was possible via GitHub, but the current environment could not clone the repository for Node/Prisma or database execution. Security, migration and end-to-end checks remain gating items for the handover release.

## Pending decisions
- Default five-day deadline: calendar or business days, local timezone, and start trigger.
- Policy for Packs with zero required forms, and optional-form closure rules.
- HR permission, guarantor/reference and sensitive-review acceptance requirements.
- Deployment ownership, environment variables and secrets, backup/rollback steps.

## Production safety
Production hosts existing real account/data records; treat it as **non-disposable**. Do not test new schema changes by dropping/recreating that database. NOLT's developers should use a separate database/target, make tested backups and a rollback plan, approve migration deltas and security checks, then deploy through an authorised release process.
