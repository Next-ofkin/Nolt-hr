> **Superseded (21 October 2026).** NOLT HR no longer runs on Railway. It now runs on a single VPS; see [DEPLOYMENT.md](../DEPLOYMENT.md). This page is kept as history of the earlier staging set-up and must not be followed for new work.

# Railway API staging

This is a testing environment, not approval for production use, paid plans or real employee imports. The frontend is currently local. API health/database checks can be verified first; full browser authentication still requires an HTTPS frontend using the existing same-origin `/api` proxy.

## Create the service

1. Sign in to Railway with GitHub. Choose a new project from the private `Next-ofkin/Nolt-hr` repository and branch `main`. Grant access to this repository only when GitHub asks.
2. Keep the service root directory at the repository root. This is an npm workspace; using `apps/api` as an isolated root excludes shared packages and Prisma files.
3. Name the service `nolt-api-staging`. The root `railway.toml` selects Railpack, builds with `npm run build:api`, starts with `npm run start:api`, and checks `/api/v1/health/ready`. Do not add a Railway database; continue using the approved Supabase development project.
4. Confirm the account remains on Free/Trial and inspect its resource/billing limits before deploying. Railway documents an initial $5/30-day trial and $1 monthly Free credit afterward. Limited trials can restrict outbound networking, which may prevent access to Supabase. Do not buy an upgrade automatically.
5. Generate an HTTPS public domain in the service's networking settings. Railway supplies `PORT`; do not hard-code `API_PORT` or expose the scanner port.

## Service variables

Add values directly to Railway Variables, never GitHub source or chat. Copy private values from the ignored local `.env.supabase` without sharing them.

| Variable | Value / instruction |
|---|---|
| `NODE_ENV` | `production` (secure transport/runtime optimisation, not production release approval) |
| `DEPLOYMENT_ENV` | `staging` (explicitly enables hosted testing; production release stays blocked) |
| `LOCAL_DEVELOPMENT` | `false` |
| `AUTH_PROVIDER` | `supabase` |
| `SUPABASE_PROJECT_REF` | `llslubzdkdnvhbatmfug` |
| `SUPABASE_URL` | `https://llslubzdkdnvhbatmfug.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Existing project publishable key |
| `SUPABASE_SECRET_KEY` | Existing server-only key; never expose to browser code |
| `AUTH_ENCRYPTION_KEY` | Existing 32-byte Base64 key for this database; do not rotate casually |
| `DATABASE_URL` | Existing restricted `nolt_app` session-pooler URL, port 5432. Retain `sslmode=verify-full`; replace its Windows `sslrootcert` value with `database/certs/supabase-prod-ca-2021.crt`, relative to the repository root. Never use the migration-owner URL. The API build now bundles the public CA and staging resolves that bundled asset internally, overriding only the sslrootcert path. |
| `PUBLIC_APP_URL` | Exact HTTPS frontend origin, without a path. Since the frontend is currently local, use the generated API HTTPS origin temporarily **for API health testing only**. This does not provide a web UI or functioning email callback pages. Replace it with the real HTTPS frontend origin before testing signup/login/invitations. |
| `INVITATION_TEST_RECIPIENTS` | Preserve the existing explicitly approved development allowlist; do not broaden it |
| `INVITATION_TTL_MINUTES` | `60` |

Do not upload `.env.supabase`, set `DIRECT_DATABASE_URL`, run bootstrap provisioning, or run automatic migrations during ordinary API startup. All ten current migrations are already applied to hosted development and their exact checksums were reverified before this checkpoint. Keep `CLAMAV_HOST` unset until a reachable maintained scanner is configured. `127.0.0.1` on Railway is not the Windows laptop. Upload confirmation intentionally fails without scanning.

## Verify after deploy

Open these URLs on your generated API domain:

```text
/api/v1/health/live
/api/v1/health/ready
```

Expected JSON is `{"status":"ok","service":"nolt-api"}` and `{"status":"ready"}`. Readiness verifies the restricted database connection; liveness alone does not. If startup fails, inspect Railway build/runtime logs without posting credentials. Check the root directory, Node 24, required variables, Linux-compatible certificate path and free/trial outbound restrictions. Do not change verified TLS to `require` or disable certificate checking.

## Connect the frontend later

Host Next.js at an HTTPS origin and set its server-only `API_ORIGIN` to the Railway API origin. Keep browser API calls relative to `/api/v1`; the existing Next.js rewrite proxies them to the API. Set the API's `PUBLIC_APP_URL` to that exact frontend origin and update Supabase Auth site/allowed redirect URLs to the actual frontend callback/invitation pages. Then test real login, MFA, session cookies, logout and the invitation journey before claiming hosted browser acceptance. Cross-site direct browser calls to the Railway API are not the delivered integration.

The delivery worker and scanner are separate services and are not launched by this API start command. Hosted scanning, upload/signature browser acceptance, cleanup jobs and production operational controls remain pending. Railway's readiness check is a deploy-time check, not continuous monitoring.

Sources: [monorepos](https://docs.railway.com/deployments/monorepo), [healthchecks](https://docs.railway.com/deployments/healthchecks), [free/trial limits](https://docs.railway.com/pricing/free-trial).
