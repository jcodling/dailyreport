#!/bin/bash
#
# lint-fix.sh — remove trailing whitespace and ensure final newline
#               across all tracked text files.
#
# Usage: ./scripts/lint-fix.sh [--dry-run]
#        ./scripts/lint-fix.sh --all          also scans untracked text files
#

set -euo pipefail

DRY_RUN=0
SCAN_ALL=0

if [ "${1:-}" = "--dry-run" ]; then
    DRY_RUN=1
fi

if [ "${2:-}" = "--all" ]; then
    SCAN_ALL=1
fi

changed=0

# --- Get list of files ----------------------------------------
if [ "$SCAN_ALL" = "1" ]; then
    files=$(git ls-files -z --no-exclude-standard 2>/dev/null | tr '\0' '\n')
else
    files=$(git ls-files -z 2>/dev/null | tr '\0' '\n')
fi

if [ -z "$files" ]; then
    echo "No files to check."
    exit 0
fi

# --- Process each file ----------------------------------------
while IFS= read -r file; do
    # Skip binary files
    if file --mime "$file" 2>/dev/null | grep -q 'charset=binary'; then
        continue
    fi

    needs_fix=0

    # Check trailing whitespace
    if grep -En '[[:space:]]+$' "$file" >/dev/null 2>&1; then
        needs_fix=1
    fi

    # Check missing final newline
    if [ -s "$file" ] && [ "$(tail -c 1 "$file" | wc -l)" -eq 0 ]; then
        needs_fix=1
    fi

    if [ "$needs_fix" -eq 1 ]; then
        if [ "$DRY_RUN" -eq 1 ]; then
            echo "[DRY-RUN] $file"
        else
            # Fix trailing whitespace: remove whitespace at end of each line
            sed -i '' 's/[[:space:]]*$//' "$file"
             # Ensure final newline
            if [ -s "$file" ] && [ "$(tail -c 1 "$file" | wc -l)" -eq 0 ]; then
                echo "" >> "$file"
            fi
            echo "[FIXED] $file"
        fi
        changed=$((changed + 1))
    fi
done <<< "$files"

echo ""
echo "Files changed: $changed"
if [ "$DRY_RUN" -eq 0 ]; then
    echo "All trailing whitespace removed. Add the files and commit again."
fi
