#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load all secrets at runtime (not baked into image)
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  source "$PROJECT_DIR/.env"
  set +a
fi

# This is the macOS / launchd path only. The container does not run this
# script: it is started via `docker run --env-file /app/.env` (see deploy-nas.sh),
# so secrets are injected by the Docker daemon rather than sourced here.
export PATH="$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin"

echo "[$(date)] Starting daily report" >> "$PROJECT_DIR/logs/dailyreport.log"

# Keep the machine awake for the run, then wake it the next day at 2:55am.
caffeinate -i "$HOME/.bun/bin/bun" run "$PROJECT_DIR/src/index.ts"

if ! pmset -g sched 2>/dev/null | grep -q "2:55"; then
    sudo pmset repeat wake MTWRFSU 02:55:00 2>/dev/null \
      || echo "[$(date)] WARNING: pmset repeat wake failed — run: sudo pmset repeat wake MTWRFSU 02:55:00" \
      >> "$PROJECT_DIR/logs/dailyreport.log"
fi

echo "[$(date)] Done" >> "$PROJECT_DIR/logs/dailyreport.log"
