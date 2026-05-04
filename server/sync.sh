#!/bin/bash
# Cron job: pulls latest processed_data from git and reimports into SQLite.
# Add to crontab: 0 4 * * * /home/pi/pc-builder/server/sync.sh >> /home/pi/pc-builder/server/sync.log 2>&1
set -e
cd "$(dirname "$0")/.."
echo "[$(date)] Pulling..."
git pull --ff-only
echo "[$(date)] Importing..."
cd server
node import.js
echo "[$(date)] Done."
