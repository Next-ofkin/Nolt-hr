# Deployment: NOLT HR on one VPS

Updated 21 October 2026. This is how NOLT HR runs today. It replaces the earlier Railway and Vercel set-up (see [superseded notes](development/RAILWAY_STAGING.md)).

## What runs where

```text
Browser ──HTTPS──> Caddy (automatic certificate) ──> web (Next.js) ──> api (NestJS, private)
                                                                          │
                                                       Supabase (Auth, PostgreSQL, private Storage)
                                                       Resend (invitation email)   Cloudmersive (file scan)
```

| Part | Where | Notes |
|---|---|---|
| Web app + API + Caddy | One Linux VPS (Contabo, Ubuntu 24.04) using Docker Compose | Files in `deploy/vps/` |
| Database, login, private files | Supabase project `Nolthr` (`llslubzdkdnvhbatmfug`) | Not on the VPS, so rebuilding the server never touches data |
| Email | Resend | Server-side key only |
| Site address | `https://hr.dastings.name.ng` | DNS **A record** for `hr` points at the VPS IP |

Only ports 22, 80 and 443 are open (firewall `ufw`). The API has no public port: the web app reaches it inside Docker as `http://api:8080`, and browsers only ever call `/api/v1/...` on the site address.

## Files

| File | Purpose |
|---|---|
| `Dockerfile.api`, `Dockerfile.web` | Build the two images from the repository root |
| `deploy/vps/docker-compose.yml` | Starts `api`, `web` and `caddy` |
| `deploy/vps/Caddyfile` | HTTPS for `$SITE_HOST`, gzip, security headers, proxy to `web` |
| `deploy/vps/env.api.example` | Template for the private API settings |
| `deploy/vps/setup.sh` | One-time setup of a fresh server |
| `deploy/vps/update.sh` | Pull the latest `main` and rebuild |
| `cloudbuild.*.yaml` | **Unused.** Left from an abandoned Google Cloud attempt |
| `railway.toml` | **Unused.** Railway is no longer used |

## First-time setup (new server)

1. Create an Ubuntu 24.04 server and point a DNS **A record** for the site name at its IP address. Wait until `nslookup <site name>` shows that IP.
2. Log in as root with SSH. Clone the repository to `/opt/nolt` (or let `setup.sh` do it).
3. Create `/opt/nolt/deploy/vps/.env.api` from `env.api.example` and fill every value. Set `PUBLIC_APP_URL` to the `https://` site address. Never commit this file: `.env.*` is git-ignored.
4. Run `bash /opt/nolt/deploy/vps/setup.sh <site name>`. It installs Docker, opens only 22/80/443, adds 2 GB swap on small servers, builds and starts everything. The first build takes several minutes.
5. In **Supabase → Authentication → URL configuration**, set the Site URL to `https://<site name>` and the redirect list to `https://<site name>/**` only. Remove any old Railway or Vercel addresses.
6. Open the site, log in and complete the checks below.

## Updating

```bash
ssh root@<server ip>
bash /opt/nolt/deploy/vps/update.sh
```

This pulls `main`, rebuilds, restarts and removes old images. Database changes (new migrations) are **not** applied by this script; see [Database changes](#database-changes).

## Environment settings (`deploy/vps/.env.api`)

| Setting | Meaning |
|---|---|
| `DEPLOYMENT_ENV=staging`, `NODE_ENV=production`, `LOCAL_DEVELOPMENT=false` | Required together by the runtime safety rules in `apps/api/src/runtime.ts` |
| `PUBLIC_APP_URL` | The `https://` site address, no path |
| `SUPABASE_PROJECT_REF`, `SUPABASE_URL` | Must match the approved Supabase project |
| `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | Supabase keys. The secret key is server-only |
| `DATABASE_URL` | Restricted `nolt_app.<project>` role, `sslmode=verify-full`. The code swaps in the bundled certificate |
| `AUTH_ENCRYPTION_KEY` | 32 random bytes, base64. **Do not change it casually**: stored login sessions become unreadable |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Invitation and guarantor email |
| `CLOUDMERSIVE_API_KEY`, `MALWARE_SCANNER_PROVIDER` | Cloud file scanning |
| `HR_INVITATION_*`, `INVITATION_*` | Invitation switches and test allow-lists |

Web branding values (`NEXT_PUBLIC_BRAND_*`) are **build-time** Docker arguments. See [branding](BRANDING_AND_DEPLOYMENT.md).

## After every deployment: quick checks

1. `docker compose ps` in `/opt/nolt/deploy/vps` shows `api` as healthy.
2. `https://<site name>/login` loads and `https://<site name>/api/v1/health/ready` says ready.
3. Log in as HR (password and authenticator), open Employees, Forms and Packs.
4. Log in as an employee on a phone-size screen and open a form.

## Database changes

The database is shared by every environment, so migrations are always deliberate:

1. Add a SQL migration under `database/migrations/` and update `database/schema.prisma`.
2. Test it against a disposable PostgreSQL database first.
3. Apply it with the migration owner connection (`npm run db:migrate`), keeping Prisma's `_prisma_migrations` history intact. Do not drop or recreate tables, and never delete `_prisma_migrations`.
4. Only then update the server.

## Operating notes

- **Logs:** `cd /opt/nolt/deploy/vps && docker compose logs -f api` (or `web`, `caddy`).
- **Restart:** `docker compose restart`.
- **Backups:** the data lives in Supabase. Check **Supabase → Database → Backups** and keep periodic private exports. A server snapshot from the VPS provider covers the server only. An owner decision to rely on defaults is recorded in the [tracker](TRACKER.md); nothing here claims a verified restore.
- **Secrets that once lived on Railway** (Supabase secret key, Resend key, Cloudmersive key) should be rotated, then updated in `.env.api`, followed by `docker compose up -d`.
- **Server access:** use key-based SSH, change the initial root password, and never commit server addresses, passwords or keys to this public repository.
- **CI:** GitHub Actions currently fails to start because of a GitHub billing lock on the account. It is not a code failure. See [main branch protection](MAIN_BRANCH_PROTECTION.md).
