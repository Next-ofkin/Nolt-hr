# Railway frontend staging

Use the existing web service created from `Next-ofkin/Nolt-hr`, branch `main`. Keep the root directory empty (repository root), one replica, and the Free/Trial plan. Do not attach the root API-only `railway.toml` to this service. No database or secret key belongs in frontend variables.

Set these service settings manually:

| Setting | Value |
|---|---|
| Build command | `npm run build:web` |
| Start command | `npm run start:web` |
| Healthcheck path | `/login` |
| Restart retries | `2` |
| Watch paths | Empty, or include all shared dependencies/configuration |

Variables (available during both build and runtime):

```env
NODE_ENV=production
DEPLOYMENT_ENV=staging
API_ORIGIN=https://noltapi-production.up.railway.app
```

Railway supplies `PORT`; Next.js reads it automatically. The hosted start command binds to `0.0.0.0`. Keep the frontend's existing relative browser API paths: its Next.js rewrite proxies `/api/*` to the configured API. Rewrites are resolved during build, so changing API_ORIGIN requires a frontend rebuild, not just a process restart. The frontend does not need DATABASE_URL, SUPABASE_SECRET_KEY or AUTH_ENCRYPTION_KEY.

After applying settings, deploy and generate a public HTTPS web domain. In the **API service**, change `PUBLIC_APP_URL` to that exact web origin, without a path, and apply/redeploy the API. This replaces the temporary API-domain value used for initial health testing. Keep the API's DEPLOYMENT_ENV=staging and existing secure transport/auth settings.

In Supabase Authentication URL Configuration, set the site URL to the web origin. Add its `/auth/callback` redirect and allow its invitation acceptance URL including the invitation query string (for example `https://YOUR-WEB-DOMAIN/invitations/accept**`). Preserve existing localhost redirects still needed for local development. No new email send is authorised by this guide.

Verify these on the **web domain**:

1. `/login` renders the login screen.
2. `/api/v1/health/ready` returns HTTP 200 with `{"status":"ready"}` through the frontend proxy.
3. Real account login, authenticator MFA, authenticated HR/employee access and logout work through the web domain. Check that session cookies are Secure, HttpOnly and host-bound, and disallowed origins still fail.

The `/login` healthcheck proves the frontend serves pages; it does not establish Auth/database workflow acceptance. Full hosted login/MFA remains pending until verified. Scanner/upload acceptance and production release remain separate gates. Two active services share the Railway account's limited free credits.
