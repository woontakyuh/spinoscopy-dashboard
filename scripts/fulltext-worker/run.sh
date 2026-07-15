#!/bin/bash
# launchd 진입점 — .env.local 로드 후 원문 확보 데몬 실행.
# 경로는 스크립트 위치에서 자동 감지 → 어느 맥에 clone해도 동작(맥미니/맥스튜디오 공통).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO"
set -a
# shellcheck disable=SC1091
. "$REPO/.env.local"
set +a
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin"
exec npx tsx "$REPO/scripts/fulltext-worker/daemon.ts"
