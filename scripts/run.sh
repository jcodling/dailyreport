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

# Detect runtime environment
IN_CONTAINER=0
if [ -f /.dockerenv ] || [ -n "$DOCKER_CONTAINER" ]; then
  IN_CONTAINER=1
fi

# Runtime setup
if [ "$IN_CONTAINER" = "1" ]; then
  # Container: bun is installed in the image
  export PATH="/usr/local/bin:/usr/bin:/bin"
else
  # macOS: use bun from PATH
  export PATH="$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin"
fi

echo "[$(date)] Starting daily report (container=$IN_CONTAINER)" >> "$PROJECT_DIR/logs/dailyreport.log"

# Run the pipeline
if [ "$IN_CONTAINER" = "1" ]; then
  # In container: just run bun, no caffeine needed
  bun run "$PROJECT_DIR/src/index.ts"
else
  # On macOS: keep the machine awake via caffeine, and wake it the next day
  caffeinate -i "$HOME/.bun/bin/bun" run "$PROJECT_DIR/src/index.ts"
  
  # Ensure recurring wake at 2:55am
  if ! pmset -g sched 2>/dev/null | grep -q "2:55"; then
    sudo pmset repeat wake MTWRFSU 02:55:00 2>/dev/null \
      || echo "[$(date)] WARNING: pmset repeat wake failed — run: sudo pmset repeat wake MTWRFSU 02:55:00" \
      >> "$PROJECT_DIR/logs/dailyreport.log"
  fi
fi

echo "[$(date)] Done" >> "$PROJECT_DIR/logs/dailyreport.log"
