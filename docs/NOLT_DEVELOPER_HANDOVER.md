# NOLT HR: Forms & Packs developer handover

Updated 21 October 2026. **Status: Forms, Packs, review and guarantor flows are implemented, applied to the production database and live.** This guide is for the NOLT development team.

## Source of truth
- Release branch: `main` (all work arrives through pull requests). The old `develop` branch is no longer the integration branch.
- Delivery ledger: [docs/TRACKER.md](TRACKER.md).
- Backend: `apps/api`; frontend: `apps/web`; Prisma schema: `database/schema.prisma`; versioned SQL: `database/migrations`.
- Server runbook: [DEPLOYMENT.md](DEPLOYMENT.md). Lifecycle rules: [FORM_AND_PACK_RULES](development/FORM_AND_PACK_RULES.md).
- Pack endpoints: `GET /api/v1/packs`, `GET /api/v1/packs/:id`, `POST /api/v1/packs`, `PUT /api/v1/packs/:id`, `POST /api/v1/packs/:id/publish`, `/unpublish`, `/reopen`, `DELETE /api/v1/packs/:id`, `POST /api/v1/packs/:id/versions`, `POST /api/v1/packs/:id/assign`, `GET /api/v1/packs/cases/:caseId`, `POST /api/v1/packs/assignments/:id/approve`, `POST /api/v1/packs/assignments/:id/extend-deadline`, `GET /api/v1/me/packs`. The generated contract is `docs/api/openapi.json`; regenerate with `npm run api:generate`.

## Migrations

All migrations in `database/migrations` are applied to production (the production `_prisma_migrations` table shows 32 completed and none incomplete, the latest being `20261021100000_form_and_pack_lifecycle`). The recent ones are:

| Migration | Purpose |
|---|---|
| `20261018100000` to `20261018150000` | Pack templates, assignments, approval, deadline history, version lineage, immutability |
| `20261019110000_hr_invitation_auth_provenance` | Invitation provenance |
| `20261019130000_auto_activate_verified_developer_hr` | Restricted auto-activation for verified developer/HR |
| `20261019182500_external_evidence_review`, `20261019203000_external_resubmission_after_hr_corrections` | Guarantor evidence review and corrections |
| `20261020110000_all_active_hr_review` | Any active HR user can review |
| `20261020210000_three_roles_only` | Roles reduced to DEVELOPER, HR, EMPLOYEE |
| `20261020220000_pack_trigger_search_path` | Hardens pack triggers |
| `20261021100000_form_and_pack_lifecycle` | Unpublish/reopen/delete rules and protection triggers |

Never edit a migration that has been applied. Add a new one. The Supabase dashboard lists the last few as applied through the Supabase tool, while earlier ones were applied through Prisma; `_prisma_migrations` is the history to trust.

## Validation gate (Node 24)

```sh
npm ci
npm run db:generate
npm run typecheck
npm test
npm run build
```

Then, for schema changes, run the migrations on a **new disposable database**, check `prisma migrate status`, and test through the real API and browser:
- Create, edit, publish, new version; old content and assignments stay unchanged.
- Employees see only their own packs and forms.
- Only authorised HR can approve; two simultaneous approvals do not both succeed.
- Deadline extensions require a reason and keep an audit trail.
- Guarantor and reference completion, review and correction cycles.
- Phone-size checks of the employee and guarantor screens.

## Open decisions
- Default five-day deadline: calendar or business days, time zone, start trigger.
- Packs with no required forms, and optional-form closure rules.
- Retention, backup and restore targets; who owns incident response.

## Production safety
Production holds real accounts and records. Do not test schema changes there by dropping or recreating tables. Use a separate database, take a verified backup first, and apply changes through the migration owner connection.
