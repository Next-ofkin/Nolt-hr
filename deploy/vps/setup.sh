#!/usr/bin/env bash
# One-time setup for NOLT HR on a fresh Ubuntu 24.04 VPS. Run as root:
#   bash setup.sh hr.example.com [git repository address]
# Before running, create /opt/nolt/deploy/vps/.env.api with the API settings (see env.api.example).
set -euo pipefail
HOST="${1:?Usage: bash setup.sh your-site-address [git repository address]}"
REPO_URL="${2:-https://github.com/Next-ofkin/Nolt-hr.git}"
echo ">> Installing system packages"
apt-get update -y && apt-get install -y git ufw curl ca-certificates
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sh; fi
echo ">> Firewall: only SSH, HTTP, HTTPS"
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
if [ "$(free -m | awk '/Mem:/{print $2}')" -lt 3500 ] && [ ! -f /swapfile ]; then
  echo ">> Small memory: adding 2 GB swap so builds do not run out"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
if [ ! -d /opt/nolt ]; then git clone "$REPO_URL" /opt/nolt; fi
cd /opt/nolt && git pull --ff-only
cd deploy/vps
[ -f .env.api ] || { echo "Missing /opt/nolt/deploy/vps/.env.api - create it first, then run this again."; exit 1; }
chmod 600 .env.api
touch .env && grep -v "^SITE_HOST=" .env > .env.tmp || true; echo "SITE_HOST=$HOST" >> .env.tmp; mv .env.tmp .env
echo ">> Building and starting (first build takes several minutes)"
docker compose up -d --build
docker compose ps
echo ">> Done. Open https://$HOST"
