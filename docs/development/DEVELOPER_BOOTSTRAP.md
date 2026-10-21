> Note (21 October 2026): references to Railway and Vercel in this page describe the earlier hosting. The app now runs on a VPS ([DEPLOYMENT.md](../DEPLOYMENT.md)). The behaviour described otherwise still applies unless the tracker says it changed.

# One-time Developer bootstrap (feature branch; not activated)

This implementation is **offline only**. It never creates a password, publishes a bootstrap HTTP route, sends invitations, or changes current HR/employee accounts. It does not run automatically on Railway/Vercel. The initial approved account is configured with `DEVELOPER_BOOTSTRAP_EMAIL` (the owner-approved email) and `DEVELOPER_BOOTSTRAP_SUBJECT` (the exact Supabase Auth UUID). Do not commit private runtime values.

## Safeguards

- A new Prisma SQL migration adds a one-slot private bootstrap ledger and a partial unique Developer-role index. It performs **no promotion** on migration.
- The command uses the privileged, authenticated-TLS Supabase connection, never the `nolt_app` runtime role. It checks for an existing bootstrap and existing Developer role under a PostgreSQL transaction advisory lock.
- It requires exact matching Supabase and local accounts, confirmed email, a **verified TOTP factor**, an identity link for the approved project, and an active unassigned `EMPLOYEE` account. Existing HR and linked employees are explicitly excluded.
- `--apply` additionally requires an interactive terminal and typing the approved email. Changes commit atomically with audit/outbox records, session revocation and an `authVersion` increment. Otherwise the transaction rolls back.
- Supabase login already enforces fresh `aal2` proof on every staff workspace session. A registered TOTP factor is **not** proof of a fresh TOTP challenge: this offline bootstrap requires sign-in and MFA after applying, not a live challenge in the operator CLI.

## Prerequisites before any hosted run

1. Verify the proposed account is owned and controlled by the intended Developer, uses the approved email, has confirmed that email and registered TOTP, and is not one of the 1 existing HR or 4 employee test accounts.
2. Obtain the exact Supabase Auth UUID from the owner-controlled admin dashboard. Double-check the existing `public."Identity"` mapping.
3. Review migration against a backup, test in an isolated database, and obtain a separate explicit owner approval before applying to hosted Supabase. **Do not run migration or bootstrap during initial coding.**
4. Keep `DEVELOPER_BOOTSTRAP_EMAIL` and `DEVELOPER_BOOTSTRAP_SUBJECT` in an ignored operator environment file, with `SUPABASE_PROJECT_REF` and `DIRECT_DATABASE_URL` protected. Never share database credentials or MFA secrets in chat.

## Planned operator commands (only after approval)

```powershell
# Review and apply the migration under the separately approved change window.
npm run db:hosted:status
npm run db:hosted:migrate

# Default is a read-only transaction that rolls back.
npm run auth:developer:preflight

# Interactive, irreversible one-time claim:
npm run auth:developer:apply
```

After apply, test login and fresh authenticator MFA with the approved Developer identity; verify privileges allow HR account administration but deny access to HR sensitive records. Do not disable unrestricted signup or old employee linking until the later controlled migration. No other active user is deleted or promoted by this procedure.

## Outstanding

- Execute automated and isolated database tests on the local workstation.
- Add full HR invitation/acceptance flow and role-based user interface.
- Independently test database permissions and live MFA with approved users.
- Deploy only after local testing, a backup, and explicit go-live approval.
