#!/bin/bash
set -euo pipefail
REPO="/Users/TakMD/workspace/spinoscopy-dashboard"
cd "$REPO"
set -a; . ./.env.local; set +a
export PATH="/Users/TakMD/.local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
exec npx tsx "$REPO/scripts/journal-collector/doi-backfill.ts"
