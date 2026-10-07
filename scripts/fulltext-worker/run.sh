#!/bin/bash
# launchd 진입점 — 원문 확보 데몬(맥스튜디오 상주).
# 경로는 스크립트 위치에서 자동 감지 → 어느 맥에 clone해도 동작(맥미니/맥스튜디오 공통).
#
# job_bootstrap 이 main + 깨끗한 트리일 때만 git pull 한다. 맥스튜디오처럼 원격에 있어
# 손대기 어려운 클론이 스스로 최신화된다 — 실제로 이 데몬은 개선 커밋이 나온 뒤에도
# 엿새 동안 옛 추출 스크립트로 돌고 있었다.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO"
# shellcheck disable=SC1091
. "$REPO/scripts/job-bootstrap.sh"
job_bootstrap "$REPO"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin"
# pull 로 의존성이 바뀌었으면 다시 깐다. npm ci 는 lock 파일을 건드리지 않아
# 트리가 더러워지지 않는다(더러워지면 다음부터 pull 이 영영 멈춘다).
if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "[run] 의존성 갱신(npm ci)"
  npm ci --no-audit --no-fund >/tmp/fulltext-npm-install.log 2>&1 || echo "[run] npm ci 실패 — 기존 모듈로 진행"
fi
exec npx tsx "$REPO/scripts/fulltext-worker/daemon.ts"
