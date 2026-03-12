#!/bin/bash
# Install macOS launchd plist for daily 7am report generation
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
        <string>${BUN_PATH}</string>
        <string>run</string>
        <string>${PROJECT_DIR}/src/index.ts</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${PROJECT_DIR}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>ANTHROPIC_API_KEY</key>
        <string>$(grep ANTHROPIC_API_KEY "${PROJECT_DIR}/.env" | cut -d= -f2)</string>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:$HOME/.bun/bin</string>
    </dict>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>7</integer>
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

echo "Installed launchd job: ${PLIST_LABEL}"
echo "Will run daily at 7:00 AM"
echo "Logs: ${LOG_DIR}/dailyreport.log"
echo ""
echo "To uninstall: launchctl unload ${PLIST_PATH} && rm ${PLIST_PATH}"
