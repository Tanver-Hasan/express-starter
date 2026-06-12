#!/bin/bash
###############################################################################
# Install and run this app as a systemd service.
# Run from anywhere after pulling the repo:
#   sudo ./deploy/setup-systemd.sh
###############################################################################
set -euo pipefail

# Resolve repo root (parent of this deploy/ dir), regardless of where it's cloned.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

SERVICE_NAME="express-starter"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
NODE_BIN="$(command -v node || echo /usr/bin/node)"
# Resolve npm next to node first (handles sudo PATH that omits npm), then fall back to PATH.
NPM_BIN="$(dirname "$NODE_BIN")/npm"
[ -x "$NPM_BIN" ] || NPM_BIN="$(command -v npm || echo "$NPM_BIN")"
APP_USER="${APP_USER:-root}"   # root so it can bind to port 80
APP_PORT="${APP_PORT:-80}"

echo "[*] App dir: $APP_DIR"

# Guard: the app uses modern JS (optional chaining). Require Node 18+.
MIN_NODE_MAJOR=18
NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt "$MIN_NODE_MAJOR" ]; then
  echo "ERROR: $NODE_BIN is Node v$NODE_MAJOR, but Node $MIN_NODE_MAJOR+ is required." >&2
  echo "       Upgrade Node, e.g.:" >&2
  echo "         curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -" >&2
  echo "         sudo apt-get install -y nodejs" >&2
  exit 1
fi
echo "[*] Using $NODE_BIN (Node v$NODE_MAJOR)"

echo "[*] Installing npm dependencies using $NPM_BIN..."
"$NPM_BIN" --prefix "$APP_DIR" install --omit=dev

echo "[*] Writing systemd unit to $SERVICE_FILE..."
cat >"$SERVICE_FILE" <<EOF
[Unit]
Description=Express Starter App
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=PORT=${APP_PORT}
Environment=NODE_ENV=production
$( [ -f "${APP_DIR}/.env" ] && echo "EnvironmentFile=${APP_DIR}/.env" )
# Entry point is src/server.js (NOT index.js)
ExecStart=${NODE_BIN} src/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "[*] Reloading systemd and starting service..."
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo "[*] Status:"
systemctl status "$SERVICE_NAME" --no-pager -l || true

echo "[*] Done. Tail logs with: journalctl -u ${SERVICE_NAME} -f"
