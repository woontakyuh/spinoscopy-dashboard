#!/bin/bash
# launchd 진입점 — .env.local에서 시크릿 로드 후 수집기 실행.
set -euo pipefail
REPO="/Users/TakMD/workspace/spinoscopy-dashboard"
cd "$REPO"
set -a
# shellcheck disable=SC1091
. "$REPO/.env.local"
set +a
export PATH="/Users/TakMD/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
exec node "$REPO/scripts/social-collector/collect.mjs"
