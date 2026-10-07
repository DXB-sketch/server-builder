#!/usr/bin/env bash
# Installs the MONOLITH Server Builder as a systemd service on Ubuntu/Debian so it
# runs 24/7, starts on boot and restarts itself if it ever crashes.
#
#   cd ~/server-builder && sudo ./deploy/install-ubuntu.sh
#
# Safe to run again (e.g. after changing the code) — it just reinstalls.
set -euo pipefail

SERVICE=monolith-bot
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN_USER="${SUDO_USER:-}"

if [[ $EUID -ne 0 ]]; then echo "Run with sudo:  sudo $0"; exit 1; fi
if [[ -z "$RUN_USER" || "$RUN_USER" == root ]]; then
  echo "Run this with sudo from your normal user account (not as root directly),"
  echo "so the bot runs as that user and not as root."
  exit 1
fi

echo "==> App folder: $APP_DIR"
echo "==> Bot will run as user: $RUN_USER"

# 1. Node.js 18+ (installs Node 22 LTS from NodeSource if missing or too old)
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if (( NODE_MAJOR < 18 )); then
  echo "==> Installing Node.js 22 LTS"
  apt-get update -y
  apt-get install -y ca-certificates curl
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
NODE_BIN=$(command -v node)
echo "==> Using $NODE_BIN ($(node -v))"

# 2. Dependencies
echo "==> Installing dependencies"
chown -R "$RUN_USER":"$RUN_USER" "$APP_DIR"
sudo -u "$RUN_USER" -H bash -c "cd '$APP_DIR' && npm ci --omit=dev --no-audit --no-fund"

# 3. .env
if [[ ! -f "$APP_DIR/.env" ]]; then
  sudo -u "$RUN_USER" cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  NEW_ENV=1
fi
# A server has no desktop, so never try to open a browser.
if grep -q '^OPEN_BROWSER=' "$APP_DIR/.env"; then
  sed -i 's/^OPEN_BROWSER=.*/OPEN_BROWSER=false/' "$APP_DIR/.env"
else
  echo 'OPEN_BROWSER=false' >> "$APP_DIR/.env"
fi
chmod 600 "$APP_DIR/.env"
chown "$RUN_USER":"$RUN_USER" "$APP_DIR/.env"

# 4. systemd service
echo "==> Writing /etc/systemd/system/$SERVICE.service"
cat > "/etc/systemd/system/$SERVICE.service" <<UNIT
[Unit]
Description=MONOLITH CREATIONS Discord Server Builder (bot + control panel)
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=10

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$APP_DIR
ExecStart=$NODE_BIN $APP_DIR/src/index.js
Environment=NODE_ENV=production
Restart=always
RestartSec=5
# hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null

if [[ "${NEW_ENV:-}" == 1 ]] || ! grep -q '^DISCORD_TOKEN=.\+' "$APP_DIR/.env"; then
  echo
  echo "!! Almost done: put your bot token and server IDs in $APP_DIR/.env"
  echo "     nano $APP_DIR/.env"
  echo "   then start it with:  sudo systemctl restart $SERVICE"
else
  systemctl restart "$SERVICE"
  sleep 3
  systemctl --no-pager --lines=15 status "$SERVICE" || true
fi

cat <<INFO

Useful commands
  sudo systemctl status $SERVICE      # is it running?
  sudo journalctl -u $SERVICE -f      # live logs (Ctrl+C to stop watching)
  sudo systemctl restart $SERVICE     # restart (after editing .env)
  sudo systemctl stop $SERVICE        # stop
  ./deploy/update.sh                  # pull the latest code + restart

Open the control panel from your PC with an SSH tunnel:
  ssh -L 3000:localhost:3000 $RUN_USER@<server-ip>
  then browse to http://localhost:3000
INFO
