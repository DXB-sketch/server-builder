#!/usr/bin/env bash
# MONOLITH Server Builder launcher (macOS / Linux)
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js is not installed. Get the LTS version from https://nodejs.org"; exit 1; }
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env — fill in your bot token and server IDs, then run ./start.sh again."
  exit 0
fi
[ -d node_modules ] || npm install --omit=dev || exit 1
exec node src/index.js
