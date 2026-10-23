#!/usr/bin/env bash
# Writes /opt/nolt-test/deploy/vps/test/.env.api for the TEST site. Run as root on the server.
# It asks for the two Supabase keys without showing them, copies the email and virus-scanner settings
# from the live site's file WITHOUT printing them, and never prints a secret.
set -euo pipefail
REF="${1:?Usage: bash make-env.sh <test Supabase project id>   (20 letters and digits)}"
[[ "$REF" =~ ^[a-z0-9]{20}$ ]] || { echo "The project id must be 20 lowercase letters and digits."; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
LIVE=/opt/nolt/deploy/vps/.env.api
APPDB=/opt/nolt-test/.local/nolt-app-database-url.txt
OUT="$HERE/.env.api"
[ -f "$LIVE" ] || { echo "Cannot find the live settings file at $LIVE"; exit 1; }
[ -f "$APPDB" ] || { echo "Cannot find $APPDB. Run the database install first (docs/TEST_SITE.md, step 4)."; exit 1; }
[ ! -f "$OUT" ] || { echo "$OUT already exists. Delete it first if you want to start again."; exit 1; }
read -r -s -p "Test project PUBLISHABLE key (not shown): " PUB; echo
read -r -s -p "Test project SECRET key (not shown): " SEC; echo
[ -n "$PUB" ] && [ -n "$SEC" ] || { echo "Both keys are required."; exit 1; }
umask 077
{
  echo "# TEST site settings. Written by make-env.sh. Never commit this file."
  echo "AUTH_ENCRYPTION_KEY=$(openssl rand -base64 32)"
  echo "AUTH_PROVIDER=supabase"
  echo "DEPLOYMENT_ENV=staging"
  echo "NODE_ENV=production"
  echo "LOCAL_DEVELOPMENT=false"
  echo "PUBLIC_APP_URL=https://hr.test.dastings.name.ng"
  echo "SUPABASE_PROJECT_REF=$REF"
  echo "SUPABASE_URL=https://$REF.supabase.co"
  echo "SUPABASE_PUBLISHABLE_KEY=$PUB"
  echo "SUPABASE_SECRET_KEY=$SEC"
  echo "DATABASE_URL=$(tr -d '\r\n' < "$APPDB")"
  echo "HR_INVITATION_DELIVERY_ENABLED=true"
  echo "HR_INVITATION_ACCEPTANCE_ENABLED=true"
  echo "HR_INVITATION_AUTO_ACTIVATION_ENABLED=true"
  echo "INVITATION_TTL_MINUTES=1440"
  echo "HR_INVITATION_TEST_RECIPIENTS="
  echo "INVITATION_TEST_RECIPIENTS="
  grep -E '^(RESEND_API_KEY|RESEND_FROM_EMAIL|MALWARE_SCANNER_PROVIDER|CLOUDMERSIVE_API_KEY|CLOUDMERSIVE_MAX_SCAN_BYTES|HR_CONTACT_LINE)=' "$LIVE" || true
} > "$OUT"
chmod 600 "$OUT"
echo "Wrote $OUT ($(wc -l < "$OUT") lines). Secrets were not printed."
grep -c '^RESEND_API_KEY=.' "$OUT" >/dev/null && echo "Email key: copied from the live site." || echo "WARNING: no RESEND_API_KEY found in the live file; emails will not send."
grep -c '^CLOUDMERSIVE_API_KEY=.' "$OUT" >/dev/null && echo "Scanner key: copied from the live site." || echo "WARNING: no scanner key found; uploads will be refused."
