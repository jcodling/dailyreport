#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load all secrets at runtime (not baked into plist)
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  source "$PROJECT_DIR/.env"
  set +a
fi

export PATH="$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin"

echo "[$(date)] Starting daily report" >> "$PROJECT_DIR/logs/dailyreport.log"
caffeinate -i "$HOME/.bun/bin/bun" run "$PROJECT_DIR/src/index.ts"
echo "[$(date)] Done" >> "$PROJECT_DIR/logs/dailyreport.log"

# Ensure recurring wake at 2:55am — skip sudo if already scheduled (launchd has no TTY)
if ! pmset -g sched 2>/dev/null | grep -q "2:55"; then
  sudo pmset repeat wake MTWRFSU 02:55:00 2>/dev/null || echo "[$(date)] WARNING: pmset repeat wake failed — run manually: sudo pmset repeat wake MTWRFSU 02:55:00" >> "$PROJECT_DIR/logs/dailyreport.log"
fi
