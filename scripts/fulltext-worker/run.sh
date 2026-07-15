#!/bin/bash
# launchd 진입점 — .env.local 로드 후 원문 확보 데몬 실행.
set -euo pipefail
# 레포 루트 자동 감지 — 설치 위치·계정명이 달라도 동작(예: 경북대 맥스튜디오)
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO"
set -a
# shellcheck disable=SC1091
. "$REPO/.env.local"
set +a
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
exec npx tsx "$REPO/scripts/fulltext-worker/daemon.ts"
