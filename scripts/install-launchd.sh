#!/bin/bash
# Install macOS launchd plist for daily 3am report generation
# Run this ONLY after verifying end-to-end output quality.

set -euo pipefail

PLIST_LABEL="com.dailyreport.generate"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUN_PATH="$HOME/.bun/bin/bun"
LOG_DIR="$PROJECT_DIR/logs"

mkdir -p "$LOG_DIR"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${SCRIPT_DIR}/run.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${PROJECT_DIR}</string>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>3</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/dailyreport.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/dailyreport.err</string>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
EOF

launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

# Set persistent recurring wake at 2:55am so machine is awake for the 3am job
sudo pmset repeat wake MTWRFSU 02:55:00 2>/dev/null || true

echo "Installed launchd job: ${PLIST_LABEL}"
echo "Will run daily at 3:00 AM"
echo "Scheduled persistent daily wake at 2:55 AM (survives reboots)"
echo "Logs: ${LOG_DIR}/dailyreport.log"
echo ""
echo "To uninstall: launchctl unload ${PLIST_PATH} && rm ${PLIST_PATH}"
