> **Superseded (21 October 2026).** NOLT HR no longer runs on Vercel. It now runs on a single VPS; see [DEPLOYMENT.md](../DEPLOYMENT.md). This page is kept as history of the earlier staging set-up and must not be followed for new work.

# Vercel frontend staging

Owner selected Vercel for the frontend on 15 October 2026 to conserve Railway credits, and chose Hobby for now after being informed that it is restricted to personal/non-commercial use. This records the preference, not confirmation of eligibility for a company portal. Do not represent Hobby as approved commercial hosting or purchase an upgrade automatically. Production release and real employee imports remain unapproved.

## Import settings

1. In Vercel, import the private GitHub repository `Next-ofkin/Nolt-hr`, branch `main`.
2. Choose **Next.js** and set **Root Directory** to `apps/web`.
3. Enable **Include source files outside of the Root Directory in the Build Step** so shared packages and project documentation are available.
4. The `apps/web/vercel.json` file configures installation (`cd ../.. && npm ci`) and build (`cd ../.. && npm run build:web`). Keep the output directory at the Next.js default (`.next`) and choose Node.js 24.x. Vercel manages startup; do not enter the Railway start command.
5. Add these variables before building, for the intended deployment environment:

```env
DEPLOYMENT_ENV=staging
API_ORIGIN=https://noltapi-production.up.railway.app
```

Vercel sets NODE_ENV for Next.js production builds. The frontend does not need DATABASE_URL, AUTH_ENCRYPTION_KEY, SUPABASE_SECRET_KEY or the database-owner connection. API_ORIGIN is a server/build variable, not a NEXT_PUBLIC variable. Rebuild after changing it because Next.js resolves rewrites during build.

## Connect the generated web domain

After deployment, send the stable HTTPS web origin (for example `https://YOUR-PROJECT.vercel.app`), without a path. Change **Railway API** `PUBLIC_APP_URL` to that origin and apply/redeploy the API. Do not change the API database variables.

In Supabase Auth URL Configuration, set Site URL to that web origin and add `https://YOUR-PROJECT.vercel.app/auth/callback` and the invitation callback including its query string (for staging, `https://YOUR-PROJECT.vercel.app/invitations/accept**`). Preserve localhost redirects still needed for local testing. Do not allow arbitrary Vercel domains for this application. Keep one stable origin for Auth acceptance; preview-deployment origins require separate deliberate configuration.

Then verify on the web domain: /login, /tracker, proxied /api/v1/health/ready, real password login/MFA, authorised workspace access and logout. Email confirmation/invitation tests require the configured redirect allowlist and existing communication approval. Full hosted browser acceptance stays unchecked until it passes.

The production tracker view uses a bundled build-time snapshot, refreshed on deployment; local development still reads the live project tracker. File scanning and third-party workflows remain pending.

Sources: [Vercel monorepos](https://vercel.com/docs/monorepos/monorepo-faq), [Hobby terms](https://vercel.com/docs/plans/hobby), [Supabase redirects](https://supabase.com/docs/guides/auth/redirect-urls).
