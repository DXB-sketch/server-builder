#!/usr/bin/env bash
# Pulls the latest code, reinstalls dependencies and restarts the service.
#   cd ~/server-builder && ./deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
npm ci --omit=dev --no-audit --no-fund
npm run check --silent
sudo systemctl restart monolith-bot
echo "Updated and restarted. Logs: sudo journalctl -u monolith-bot -f"
