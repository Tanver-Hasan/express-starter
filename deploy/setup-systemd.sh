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
APP_USER="${APP_USER:-root}"   # root so it can bind to port 80
APP_PORT="${APP_PORT:-80}"

echo "[*] App dir: $APP_DIR"

echo "[*] Installing npm dependencies..."
npm --prefix "$APP_DIR" install --omit=dev

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
