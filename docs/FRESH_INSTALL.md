# Fresh install on your own accounts

For an IT team that takes over NOLT HR and wants to own everything: its own Supabase project, server, domain, email and scanner accounts. Nothing here uses the original owner's accounts. Written 22 October 2026.

**Status of this procedure.** The database installer was rehearsed on a throwaway PostgreSQL that imitates a new Supabase project (`npm run test:install`, 7 checks). It has **not** been run against a real new Supabase project. Do the whole procedure once on a staging project and domain before real people use it.

## What you need

| Account | Used for | Notes |
|---|---|---|
| GitHub (your organisation) | Holds the code and updates | Copy (fork) the repository. A private repository is fine |
| Supabase | Login, PostgreSQL database, private file storage | One new project. Choose the region closest to your staff. When creating it, leave **Automatically enable RLS** ticked |
| Server | Runs the web app, API and HTTPS | Ubuntu 24.04, 2 vCPU, 4 GB RAM or more, public IPv4 |
| Domain name | The site address | You must be able to add a DNS **A record** |
| Resend | Sends the emails | Verify your sending domain. Create an API key |
| Cloudmersive | Scans every uploaded file for viruses | **Required.** With no scanner configured, uploads are refused on purpose |
| Authenticator app | Everyone signs in with password plus a 6-digit code | Staff install it on their phones |

On your own computer: Node.js 24, git, and the Supabase **Session pooler** connection details.

## Steps

### 1. Copy the code

Fork the repository into your organisation and clone it on your computer. Run `npm ci`.

### 2. Create the Supabase project

Note these five values (Project Settings):
- **Project id**: 20 letters and digits, for example `abcdefghijklmnopqrst`
- **Project URL**: `https://<project id>.supabase.co`
- **Publishable key** and **Secret key** (API keys)
- **Database password** you chose, used in the Session pooler address `postgresql://postgres.<project id>:<password>@<region>.pooler.supabase.com:5432/postgres`

Use the **Session pooler** (port 5432), not the direct address. Servers are normally IPv4 only.

### 3. Set up sign-in in Supabase (Authentication)

- URL configuration: Site URL `https://<your site>`; Redirect URLs `https://<your site>/**` only
- Providers, Email: confirm email **on**; minimum password length **12**; **Email OTP expiration 86400 seconds** (24 hours; it must be at least `INVITATION_TTL_MINUTES`)
- Multi-factor: TOTP enrol and verify **on**
- SMTP settings: enable custom SMTP with Resend: host `smtp.resend.com`, port `465`, user `resend`, password = your Resend API key, sender = an address on your verified domain

### 4. Install the database (once, from your computer)

```bash
export OWNER_DATABASE_URL='postgresql://postgres.<project id>:<password>@<region>.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=/absolute/path/to/database/certs/supabase-prod-ca-2021.crt'
export SUPABASE_URL='https://<project id>.supabase.co'
export SUPABASE_SECRET_KEY='<secret key>'
export BOOTSTRAP_HR_EMAIL='first.hr.admin@yourcompany.com'
node scripts/install-fresh.mjs
```

It refuses to run on a database that already has tables. It creates the restricted app user, applies every migration, installs the sign-in hooks and the exact permission set, points the database functions at your project, checks the security rules, creates the private file bucket and saves the app's database address to `.local/nolt-app-database-url.txt`. Copy that line into `DATABASE_URL` on the server, then delete the file.

If the database connection fails on the certificate, download your project's CA certificate (Database settings, SSL configuration), replace `database/certs/supabase-prod-ca-2021.crt` with it, commit, and try again. The API uses the same file.

If the installer stops part-way, the database is half-installed: delete the Supabase project, create a new one and start again.

### 5. Server and domain

Point the DNS A record for the site name at the server. As root on the server, clone your repository to `/opt/nolt` (use a deploy key if it is private), then create `/opt/nolt/deploy/vps/.env.api` from `env.api.example`. Generate the encryption key with `openssl rand -base64 32`.

| Setting | Value |
|---|---|
| `DEPLOYMENT_ENV` | `staging` (keep this value: the code blocks other modes until your team signs off the release gates) |
| `NODE_ENV` / `LOCAL_DEVELOPMENT` | `production` / `false` |
| `PUBLIC_APP_URL` | `https://<your site>` |
| `AUTH_PROVIDER` | `supabase` |
| `SUPABASE_PROJECT_REF`, `SUPABASE_URL` | Your project id and URL (they must agree) |
| `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | From step 2 |
| `DATABASE_URL` | The line saved by the installer |
| `AUTH_ENCRYPTION_KEY` | 32 random bytes, base64. Never change it later |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Resend key; sender such as `NOLT HR <hr@yourdomain>` |
| `MALWARE_SCANNER_PROVIDER`, `CLOUDMERSIVE_API_KEY` | `cloudmersive` and your key |
| `CLOUDMERSIVE_MAX_SCAN_BYTES` | Largest file your Cloudmersive plan scans (default 3500000; the app allows 5 MB) |
| `HR_INVITATION_DELIVERY_ENABLED`, `HR_INVITATION_ACCEPTANCE_ENABLED`, `HR_INVITATION_AUTO_ACTIVATION_ENABLED` | all `true` (needed for the Developer to invite HR) |
| `INVITATION_TTL_MINUTES` | `1440` |
| `HR_CONTACT_LINE` | Optional: shown to guarantors in the "Is this email real?" box |

Then run `bash /opt/nolt/deploy/vps/setup.sh <your site> <your repository address>`.

Optional branding: add `NEXT_PUBLIC_BRAND_NAME=...` and the other `NEXT_PUBLIC_BRAND_*` lines to `/opt/nolt/deploy/vps/.env` before the build. To use a logo, commit it under `apps/web/public/branding/` first. See [branding](BRANDING_AND_DEPLOYMENT.md).

### 6. First sign-in

1. Open `https://<your site>/signup` and sign up with the `BOOTSTRAP_HR_EMAIL` address. Confirm the email, then add the authenticator app. This account becomes HR automatically.
2. Check `https://<your site>/api/v1/health/ready` says ready.

### 7. Create the Developer account

The Developer (IT) invites further HR administrators and cannot read HR records.
1. Sign up a second account (another email) at `/signup`, confirm it and add the authenticator app.
2. In Supabase, Authentication, Users, copy that user's **UID**.
3. On your computer, with the owner address in `DIRECT_DATABASE_URL` (the same Session pooler address as step 4), run:

```bash
export SUPABASE_PROJECT_REF='<project id>' DIRECT_DATABASE_URL='<owner address>'
export DEVELOPER_BOOTSTRAP_EMAIL='<developer email>' DEVELOPER_BOOTSTRAP_SUBJECT='<UID>'
npm run auth:developer:preflight   # read-only check
npm run auth:developer:apply       # asks you to type the email to confirm
```

4. Sign in again as that user and finish the authenticator step. You now see the Developer overview.

### 8. Check everything

- HR can open Employees, Forms and Packs; create and publish a form; add a test employee; send the invitation.
- The employee opens the email, sets a password and authenticator, fills a form, uploads a photo and signs.
- HR reviews and approves it. A guarantor email arrives and its link opens the form.
- `docker compose ps` in `/opt/nolt/deploy/vps` shows the API as healthy.

## After go-live

- **Updates:** `bash /opt/nolt/deploy/vps/update.sh`. New database migrations are applied separately with the owner address (`npm run db:migrate` with `DIRECT_DATABASE_URL` set), before updating the server.
- **Backups:** check what your Supabase plan includes, and make a periodic export of the database and of the `nolt-private-documents` bucket. Nothing in this repository has proven a restore.
- **Keys:** a new installation has new keys, but rotate them again when staff who handled them leave. Changing `AUTH_ENCRYPTION_KEY` signs everyone out.
- **Logs:** `docker compose logs -f api` in `/opt/nolt/deploy/vps`.

See also [DEPLOYMENT.md](DEPLOYMENT.md) (day-to-day server runbook) and [DECISIONS](planning/DECISIONS.md).
