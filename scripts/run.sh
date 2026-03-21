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

# Schedule wake for 5 min before tomorrow's 3am run
NEXT_WAKE=$(date -v+1d "+%m/%d/%y 02:55:00")
sudo pmset schedule wake "$NEXT_WAKE" 2>/dev/null || true
