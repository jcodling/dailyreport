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
"$HOME/.bun/bin/bun" run "$PROJECT_DIR/src/index.ts"
echo "[$(date)] Done" >> "$PROJECT_DIR/logs/dailyreport.log"
