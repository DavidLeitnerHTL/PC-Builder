#!/bin/bash
# Run once on the Raspberry Pi to set up the API server.
# Usage: bash setup-pi.sh
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_DIR="$REPO_DIR/server"
SERVICE_USER="$(whoami)"

echo "==> Checking Node.js..."
if ! command -v node &>/dev/null; then
    echo "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
node --version

echo "==> Installing build tools for native modules..."
sudo apt-get install -y python3 make g++

echo "==> Installing npm dependencies..."
cd "$SERVER_DIR"
npm install

echo "==> Running initial import..."
node import.js

echo "==> Creating systemd service..."
sudo tee /etc/systemd/system/pc-builder-api.service > /dev/null <<EOF
[Unit]
Description=PC Builder API
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$SERVER_DIR
ExecStart=$(which node) server.js
Restart=on-failure
RestartSec=5
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable pc-builder-api
sudo systemctl start pc-builder-api

echo "==> Setting up daily sync cron job (04:00)..."
CRON_CMD="0 4 * * * $SERVER_DIR/sync.sh >> $SERVER_DIR/sync.log 2>&1"
chmod +x "$SERVER_DIR/sync.sh"
( crontab -l 2>/dev/null | grep -v "sync.sh"; echo "$CRON_CMD" ) | crontab -

echo ""
echo "Done!"
echo "  API:    http://localhost:3000/api/CPU"
echo "  Health: http://localhost:3000/health"
echo "  Logs:   journalctl -u pc-builder-api -f"
