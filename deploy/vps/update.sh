#!/usr/bin/env bash
# Pull the latest code and restart. Run as root:  bash /opt/nolt/deploy/vps/update.sh
set -euo pipefail
cd /opt/nolt && git pull --ff-only
cd deploy/vps && docker compose up -d --build && docker image prune -f && docker compose ps
