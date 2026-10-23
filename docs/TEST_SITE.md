# A test copy of NOLT HR (hr.test.dastings.name.ng)

A second copy of the site on the same server, with its **own database project and keys**, so changes can be tried on fake data before they reach the live site. The live Caddy proxy serves it. The live site's database is never touched.

| | Live | Test |
|---|---|---|
| Address | `https://hr.dastings.name.ng` | `https://hr.test.dastings.name.ng` |
| Code folder on the server | `/opt/nolt` | `/opt/nolt-test` |
| Database | Supabase "Nolthr" | Supabase "NOLT HR Auth Sandbox" (`wyoeaiowdvzjtcnzhktv`) |
| Containers | `api`, `web`, `caddy` | `api-test`, `web-test` (no proxy of its own) |
| Settings file | `deploy/vps/.env.api` | `deploy/vps/test/.env.api` |

The test copy reuses the live Resend and Cloudmersive settings (copied by a script, never printed). Use **fake people and your own email addresses only** on it.

## One-time setup (as root on the server)

**0. Update the live server once**, so its proxy can serve extra sites: `bash /opt/nolt/deploy/vps/update.sh`. This restarts the proxy for a few seconds.

**1. Supabase test project, Authentication settings** (dashboard):
- URL configuration: Site URL `https://hr.test.dastings.name.ng`; Redirect URLs `https://hr.test.dastings.name.ng/**` only.
- Email: confirm email on; minimum password length 12; Email OTP expiration 86400 seconds.
- Multi-factor: TOTP enrol and verify on.
- SMTP: custom SMTP with Resend (host `smtp.resend.com`, port `465`, user `resend`, password = the Resend API key, sender on your verified domain).

**2. Note three values** from the test project: the 20-character project id, the **publishable key** and **secret key** (Project Settings, API keys), and its **Session pooler address** (Connect button, "Session pooler", port 5432). If you do not know the database password, reset it in Database settings.

**3. Put the code on the server:**
```bash
git clone --branch feat/developer-owns-forms-and-packs https://github.com/Next-ofkin/Nolt-hr.git /opt/nolt-test
```

**4. Install the database** (only once; it refuses a database that already has tables). Paste the secrets when asked; they are not shown:
```bash
cd /opt/nolt-test
docker run --rm -it -v /opt/nolt-test:/app -w /app node:24-slim bash -c '
  npm ci --no-audit --no-fund &&
  read -r -s -p "Session pooler address with the password filled in (not shown): " U && echo &&
  read -r -s -p "Test SECRET key (not shown): " K && echo &&
  read -r -p "Email for the first HR admin (use your own): " E &&
  OWNER_DATABASE_URL="$U?sslmode=verify-full&sslrootcert=/app/database/certs/supabase-prod-ca-2021.crt" \
  SUPABASE_URL="https://wyoeaiowdvzjtcnzhktv.supabase.co" SUPABASE_SECRET_KEY="$K" BOOTSTRAP_HR_EMAIL="$E" \
  node scripts/install-fresh.mjs'
```
It saves the app's restricted database address in `/opt/nolt-test/.local/`. This is the first real run of the installer on a real Supabase project: if it stops part-way, tell me the message, then delete and recreate the test project before trying again.

**5. Write the test settings:** `bash /opt/nolt-test/deploy/vps/test/make-env.sh wyoeaiowdvzjtcnzhktv`

**6. Let the live proxy serve the test address:**
```bash
cp /opt/nolt/deploy/vps/caddy-extra/test.caddy.example /opt/nolt/deploy/vps/caddy-extra/test.caddy
```
(The live proxy is reloaded in step 7.)

**7. Start the test copy, then reload the proxy:**
```bash
cd /opt/nolt-test/deploy/vps/test && docker compose -p nolt-test up -d --build
cd /opt/nolt/deploy/vps && docker compose exec -w /etc/caddy caddy caddy reload --config /etc/caddy/Caddyfile
```
Open `https://hr.test.dastings.name.ng` and check `https://hr.test.dastings.name.ng/api/v1/health/ready`.

**8. First sign-in and the Developer account:** follow [FRESH_INSTALL.md](FRESH_INSTALL.md) steps 6 and 7, using the test project.

## Updating the test copy later
```bash
cd /opt/nolt-test && git pull --ff-only
# only when a pull request adds a database migration (apply with the owner address typed silently):
#   read -r -s -p "Owner pooler address: " DIRECT_DATABASE_URL; export DIRECT_DATABASE_URL; npm ci && npm run db:migrate
cd deploy/vps/test && docker compose -p nolt-test up -d --build
```

## Moving the tested change to live
1. The pull request is approved and merged into `main`.
2. Back up first: note the live site's Supabase "Nolthr" backup status in the dashboard.
3. Apply the new database migrations to the live database with the owner address (`npm run db:migrate` with `DIRECT_DATABASE_URL`), **before** the server update.
4. Run `bash /opt/nolt/deploy/vps/update.sh` and check `https://hr.dastings.name.ng/api/v1/health/ready`.
5. If something is wrong, `git -C /opt/nolt checkout <previous commit>` and run `update.sh` again. New migrations only add things, so the older code keeps working.

## Removing the test copy
`cd /opt/nolt-test/deploy/vps/test && docker compose -p nolt-test down`, delete `/opt/nolt/deploy/vps/caddy-extra/test.caddy`, reload the proxy, delete `/opt/nolt-test`.
