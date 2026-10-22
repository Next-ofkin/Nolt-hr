# NOLT HR: branding and handover

Updated 21 October 2026. For the day-to-day server runbook see [DEPLOYMENT.md](DEPLOYMENT.md).

This repository supports a **configuration-first handover**. A new owner can change the public brand and run their own copy, but no button can securely move database credentials, migrate a live database or grant Production access. Those stay explicit operator steps.

## Branding

Branding is read in `apps/web/src/lib/brand.ts` and is **build-time**: change a value, then rebuild the web image.

| Setting | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_BRAND_NAME` | `NOLT` | Max 60 characters |
| `NEXT_PUBLIC_BRAND_TAGLINE` | `People` | Max 60 |
| `NEXT_PUBLIC_PRODUCT_NAME` | `HR` | Max 50 |
| `NEXT_PUBLIC_BRAND_DESCRIPTION` | `Employee onboarding and HR workspace` | Max 160 |
| `NEXT_PUBLIC_BRAND_PRIMARY` | `#0b63ce` | Six-digit hex colour |
| `NEXT_PUBLIC_BRAND_LOGO_PATH` | none (shows an initial) | `/branding/<file>.png`, `.webp`, `.jpg` or `.jpeg` only |

`Dockerfile.web` accepts these as build arguments. To use a logo, create `apps/web/public/branding/` and commit the image there (the folder does not exist yet; the NOLT logo file is still to be supplied). External URLs, SVG and arbitrary HTML are refused on purpose. **Never put API keys in `NEXT_PUBLIC_*` values.**

Other brand assets already in the app: `apps/web/src/app/icon.svg` (site icon) and `apple-icon.png` (180x180 phone icon). The font is Lexend (`@fontsource-variable/lexend`); this is a working choice, not a confirmed brand font. Colours and text styles are defined in `apps/web/src/app/globals.css`.

## Running a separate copy (handover)

Follow **[FRESH_INSTALL.md](FRESH_INSTALL.md)**. It covers the accounts to create, a one-command database installer for a new Supabase project, the server settings, first sign-in and the Developer account. Never reuse the NOLT production project.

## Existing NOLT hosting

- Production Supabase project `llslubzdkdnvhbatmfug` is not disposable and holds real accounts and records.
- The web app and API run on one VPS (Docker Compose + Caddy). Railway and Vercel are retired.
- Deployments, database migrations and domain changes remain manual approval steps.

## Read-only handover check

`npm run handover:check` (Node 24) checks that handover files, pack migration markers, the logo location and branding values are present. It is read-only and does not replace the full tests or a migration review. Its checks may refer to Railway and Vercel wording from the earlier set-up.

## Source verification

```sh
npm ci
npm run db:generate
npm run typecheck
npm test
npm run build
```

At the last run (21 October 2026) typecheck and build were clean and all 150 tests passed.
