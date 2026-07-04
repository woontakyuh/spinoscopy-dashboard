#!/bin/bash
# launchd 진입점 — .env.local 로드 후 원문 확보 데몬 실행.
set -euo pipefail
REPO="/Users/TakMD/workspace/spinoscopy-dashboard"
cd "$REPO"
set -a
# shellcheck disable=SC1091
. "$REPO/.env.local"
set +a
export PATH="/Users/TakMD/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
exec npx tsx "$REPO/scripts/fulltext-worker/daemon.ts"
