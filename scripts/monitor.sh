#!/bin/bash
# Colourised log monitor for dailyreport
# Usage: scripts/monitor.sh [--all]   (--all shows full history, default tails live)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="$(dirname "$SCRIPT_DIR")/logs/dailyreport.log"
ERR="$(dirname "$SCRIPT_DIR")/logs/dailyreport.err"

if [ ! -f "$LOG" ]; then
  echo "No log file found at $LOG" >&2
  exit 1
fi

TAIL_ARGS=("-f" "-n" "50")
if [[ "${1:-}" == "--all" ]]; then
  TAIL_ARGS=("-f" "-n" "+1")
fi

# Colour constants
RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'

BLACK='\033[30m'
RED='\033[31m'
GREEN='\033[32m'
YELLOW='\033[33m'
BLUE='\033[34m'
MAGENTA='\033[35m'
CYAN='\033[36m'
WHITE='\033[37m'

BOLD_GREEN='\033[1;32m'
BOLD_YELLOW='\033[1;33m'
BOLD_CYAN='\033[1;36m'
BOLD_WHITE='\033[1;37m'

tail "${TAIL_ARGS[@]}" "$LOG" | awk -v R="$RESET" \
  -v DIM="$DIM" \
  -v BOLD_CYAN="$BOLD_CYAN" \
  -v BOLD_YELLOW="$BOLD_YELLOW" \
  -v BOLD_GREEN="$BOLD_GREEN" \
  -v BOLD_WHITE="$BOLD_WHITE" \
  -v CYAN="$CYAN" \
  -v GREEN="$GREEN" \
  -v YELLOW="$YELLOW" \
  -v MAGENTA="$MAGENTA" \
  -v RED="$RED" \
  -v WHITE="$WHITE" \
'
{
  line = $0

  # Strip optional [HH:MM:SS] prefix (from log.ts) to get matchable content
  content = line
  if (line ~ /^\[[0-9][0-9]:[0-9][0-9]:[0-9][0-9]\] /) {
    content = substr(line, 12)
  }

  # run.sh markers: [Day Mon DD HH:MM:SS TZ YYYY] Starting/Done
  if (line ~ /^\[.* 20[0-9][0-9]\]/) {
    print BOLD_CYAN line R
  }
  # Feedback (before error check — titles contain geopolitical content that triggers error regex)
  else if (content ~ /^Feedback:/) {
    print MAGENTA line R
  }
  # Warnings / errors (only bare ⚠️ lines or explicit error words, not embedded in content)
  else if (content ~ /^[Ee]rror|^FAIL|^failed|^ERROR/ || content ~ /^\u26a0/) {
    print RED line R
  }
  # Success / summary lines
  else if (content ~ /^(Report written|Curated:|Total:|Pre-filter:|Done)/) {
    print BOLD_GREEN line R
  }
  # Section headers — known prefixes or lines ending with ...
  else if (content ~ /^(Loaded|Fetching|Calling Claude|FTP:|Parsing|Uploading|Scheduling|Pre-filtering|Calling|Syncing|Ranked|Blacklisted)/ || \
           (content ~ /\.\.\.$/ && content !~ /^  /)) {
    print BOLD_YELLOW line R
  }
  # sftp upload
  else if (line ~ /\[sftp\] ↑/) {
    print GREEN line R
  }
  # sftp download
  else if (line ~ /\[sftp\] ↓/) {
    print CYAN line R
  }
  # Indented stat lines (  HN:, Reddit:, RSS:, etc.)
  else if (line ~ /^  [A-Za-z]/) {
    print DIM line R
  }
  # Default
  else {
    print WHITE line R
  }
}
'
