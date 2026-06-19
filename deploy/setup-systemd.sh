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
NGINX_SITE="/etc/nginx/sites-available/${SERVICE_NAME}"
MIN_NODE_MAJOR=18          # app uses optional chaining; needs Node 18+
NODE_INSTALL_MAJOR=24      # version installed if missing/too old
APP_PORT="${APP_PORT:-3000}"   # app listens here; nginx proxies :80 -> :3000

# Run the app as the user that owns the repo (falls back to root) so the
# WorkingDirectory stays readable for the service.
APP_USER="${APP_USER:-$(stat -c '%U' "$APP_DIR" 2>/dev/null || echo root)}"

# Installs system packages and writes to /etc, so it must run as root.
if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: please run with sudo: sudo $0" >&2
  exit 1
fi

echo "[*] App dir:  $APP_DIR"
echo "[*] App user: $APP_USER"
echo "[*] App port: $APP_PORT"

###############################################################################
# 1. Ensure a clean, supported Node.js is installed
###############################################################################
node_major() {
  command -v node >/dev/null 2>&1 \
    && node -p 'process.versions.node.split(".")[0]' 2>/dev/null \
    || echo 0
}

CURRENT_NODE_MAJOR="$(node_major)"
if [ "${CURRENT_NODE_MAJOR:-0}" -lt "$MIN_NODE_MAJOR" ]; then
  echo "[*] Node v${CURRENT_NODE_MAJOR} missing or too old; installing Node ${NODE_INSTALL_MAJOR}.x cleanly..."
  apt-get remove -y nodejs libnode-dev npm >/dev/null 2>&1 || true
  apt-get autoremove -y >/dev/null 2>&1 || true
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_INSTALL_MAJOR}.x" | bash -
  apt-get install -y nodejs
else
  echo "[*] Node $(node -v) already satisfies >= ${MIN_NODE_MAJOR}"
fi

NODE_BIN="$(command -v node)"
NPM_BIN="$(command -v npm)"
echo "[*] Using node=$NODE_BIN ($(node -v)), npm=$NPM_BIN ($("$NPM_BIN" -v))"

###############################################################################
# 2. Install app dependencies
###############################################################################
echo "[*] Installing npm dependencies..."
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

###############################################################################
# 3. Enable and start the app service
###############################################################################
echo "[*] Reloading systemd and starting service..."
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

###############################################################################
# 4. Install and configure nginx as a reverse proxy (:80 -> :APP_PORT)
###############################################################################
if ! command -v nginx >/dev/null 2>&1; then
  echo "[*] Installing nginx..."
  apt-get install -y nginx
fi

echo "[*] Writing nginx site to $NGINX_SITE..."
# Unquoted heredoc: ${APP_PORT} is expanded now, \$nginx vars are kept literal.
cat >"$NGINX_SITE" <<NGINX
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade           \$http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_read_timeout 60s;
    }
}
NGINX

ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/${SERVICE_NAME}"
rm -f /etc/nginx/sites-enabled/default   # remove default to avoid default_server clash

echo "[*] Testing nginx config..."
nginx -t
systemctl enable nginx
systemctl restart nginx

###############################################################################
# Done
###############################################################################
echo "[*] Status:"
systemctl status "$SERVICE_NAME" --no-pager -l || true
echo
echo "[*] Done."
echo "    App:   http://127.0.0.1:${APP_PORT}  (systemd unit: ${SERVICE_NAME})"
echo "    Proxy: http://<server>/  ->  nginx :80  ->  app :${APP_PORT}"
echo "    Logs:  journalctl -u ${SERVICE_NAME} -f"
