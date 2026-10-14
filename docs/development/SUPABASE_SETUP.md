# Supabase setup

Project: [llslubzdkdnvhbatmfug](https://supabase.com/dashboard/project/llslubzdkdnvhbatmfug). Real Supabase PostgreSQL and Auth are integrated. The owner configures Resend directly in Supabase SMTP; real invitation receipt and activation were owner-verified on 14 October 2026.

## Database and TLS

Seven Prisma migrations are applied. `_prisma_migrations` stores the original names and exact SHA-256 checksums, independently verified against local files. There is no competing Supabase application migration history.

Migration files retain their exact applied bytes through `.gitattributes` (`-text diff`). Existing history contains both CRLF and LF files; do not normalise their line endings. Staged content is checked against the applied local files before publishing, so Windows/Linux checkouts preserve the same checksums.

The restricted `nolt_app` role has only required table operations, no schema creation/superuser/role creation/RLS bypass and no user/role mutation rights. All 16 application tables and migration history have RLS; public API roles have no table access. Audit and submission evidence are append-only to the runtime role. Private hosting functions handle verified Auth identity provisioning and actual provider-session revocation checks without exposing Auth tables to the API.

The Session pooler endpoint is `aws-0-eu-west-1.pooler.supabase.com:5432`. Ignored connection URLs use `sslmode=verify-full` and `sslrootcert` pointing to `database/certs/supabase-prod-ca-2021.crt`, downloaded from the official dashboard's public certificate URL. Node client TLS and hostname verification passed. On another machine, update the absolute certificate path in the ignored URLs. Never disable certificate verification.

## Authentication

See [identity setup](IDENTITY.md). Synthetic shortcuts/providers are removed and fixture accounts are inactive. New real Auth identities start as EMPLOYEE regardless of editable metadata. A private one-time bootstrap grants HR to the owner-approved email after confirmation. All workspace access requires actual authenticator MFA.

`npm run dev` and `npm run dev:hosted` overlay ignored `.env.supabase` on loopback transport settings and start the real API/web. Browser code receives no database/server key, provider access token or refresh token. Persistent provider tokens/flows are encrypted server-side; keep `AUTH_ENCRYPTION_KEY` private and stable.

```powershell
npm run db:hosted:status
npm run db:hosted:verify
npm run db:hosted:migrate
npm run auth:setup
npm run dev
```

`db:hosted:migrate` runs Prisma migrate deploy with the selected owner environment. `auth:setup` idempotently installs private hosting functions and the approved bootstrap email. Do not use resets, db push, or a second migration history. New exposed tables need RLS and explicit grants in their migration before use.

`scripts/supabase-bootstrap.mjs` is the completed initial empty-database bootstrap; do not rerun it. Portable schema changes stay under `database/migrations`; hosting-specific functions and public API hardening are recorded separately. Supabase config contains only reviewed Auth settings plus disabled local migrations/seeds; SMTP secrets are undeclared and remain managed in the hosted dashboard.

## Verification and remaining limits

The current real-Auth run passed 11 backend/unit/security tests and 4 Chromium journeys. Disposable live-test provider users are removed after tests; their application identities are deactivated while audit/forms remain. Earlier fixture-only results are historical. See [current report](TEST_REPORT.md).

The owner must still validate actual email confirmation/recovery and first HR signup after connecting Resend SMTP. Leaked-password protection is disabled and requires separate Pro-plan consideration; no paid upgrade was performed. Production deployment, role administration, recovery procedures, worker/scanning/private uploads and remaining release gates are not approved or complete.

References: [Prisma](https://supabase.com/docs/guides/database/prisma), [connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [SSL](https://supabase.com/docs/guides/platform/ssl-enforcement), [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).


Owner acceptance, 13 October 2026: Resend SMTP email delivery, real signup/email confirmation and authenticator MFA are confirmed working by the owner. Password recovery and first HR bootstrap verification remain separate checks.


14 October 2026 onboarding update: pooler DNS resolved again; Prisma applied migration 005. Private verified-account linking SQL installed through auth:setup. All five migration checksums match; restricted-runtime verified TLS, RLS/grant checks and public Data API denial for all three new tables passed. Approved first HR bootstrap membership verified without displaying owner details. Security advisors report only the previously recorded leaked-password-protection warning; no new database warnings.
