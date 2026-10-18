# NOLT HR — rebrand and deploy handover

This source package supports a **configuration-first handover**. The new owner can change the public brand and deploy their own instance, but **no button can securely transfer database credentials, migrate a live database, or authorise Production access without an explicit operator step**.

## Quick branding setup
In Vercel's project environment settings, define these **public** values (then rebuild):
```dotenv
NEXT_PUBLIC_BRAND_NAME=NOLT
NEXT_PUBLIC_BRAND_TAGLINE=People
NEXT_PUBLIC_PRODUCT_NAME=HR
NEXT_PUBLIC_BRAND_DESCRIPTION=Employee onboarding and HR workspace
NEXT_PUBLIC_BRAND_PRIMARY=#006b5e
NEXT_PUBLIC_BRAND_LOGO_PATH=/branding/company-logo.png
```
For the logo, add your PNG, WebP or JPEG image to `apps/web/public/branding/company-logo.png` before deployment. Path values are intentionally restricted to `/branding/<filename>.png|webp|jpg|jpeg`; external URLs, SVG and arbitrary HTML are not allowed. Omit the logo variable to show the company's initial instead. **Never store API keys in NEXT_PUBLIC variables.**

## One place to configure hosting
1. Fork/copy this repository into the NOLT developer team's GitHub organisation.
2. Create/import the web project in Vercel from `apps/web`, with the repository's existing monorepo install/build configuration; set the branding variables above and `API_ORIGIN` to the **approved** backend URL.
3. Create/import the API project into Railway with root `railway.toml`, using `npm run build:api`, `npm run start:api` and `/api/v1/health/ready`.
4. Configure **private server-only** environment values directly in the hosting secret managers, including the database roles, Supabase Auth project details, encryption and mail credentials. Never copy real secret values into Git or shared handover files.
5. Before first full deployment, run the migration inventory and apply only verified missing migrations using the migration owner's connection. Keep `_prisma_migrations` intact.
6. Update Supabase Auth redirect URLs, allowed origins, OAuth/email templates and verified sender domain to the approved frontend hostname. Review private Storage bucket and ClamAV requirements.
7. Confirm API readiness, authentication/MFA, authorisation, onboarding end-to-end and rollback/backup. Switch customer traffic only after explicit release sign-off.

## Existing NOLT hosting (do not automatically overwrite)
- Existing Supabase **Production** project `llslubzdkdnvhbatmfug` is not disposable and retains active users.
- Existing Railway API service uses GitHub `main` and the Railway `production` environment.
- The current `nolt-hr` Vercel project exists but its connected-project management returned a 403 access error; its live URL and state could not be confirmed through the app connection.
- Preview, deployment, database migration, merge and domain cutover remain manual **approval gates**. Successful local code build and unit tests do not replace migration testing.
- Zero-cost hosting beyond existing free allowances is not guaranteed; confirm plan limits before provisioning services.

## One-command handover preflight
Run `npm run handover:check` using Node 24 to check the presence of handover files, Pack migration SQL markers, logo location and branding values. This command is **read-only**: it does not migrate, deploy, access Production or verify secrets. A successful preflight does not replace full app tests and migration review.

## Source verification
```sh
npm ci
npm run db:generate
npm run typecheck
npm test
npm run build
```
The feature branch passed local typecheck and full frontend/backend build at commit `06a3827`; the preceding commit passed 99/99 unit tests. Branding work introduced afterward still requires another typecheck/build. New migration files from `20261018100000` through `20261018150000` are **not yet applied or integration-tested**.

## What "one-click" will mean
A deployment button or guided checklist can automate the **code import and initial service scaffolding**, but the NOLT team must still supply credentials, approve migrations and verify live access. This is a responsible repeatable handover, not an unsafe button that resets or deploys into an existing customer's Production database.
