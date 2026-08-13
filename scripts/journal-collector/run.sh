#!/bin/bash
# launchd 진입점 — 코어 저널 PubMed 수집기.
# 경로는 스크립트 위치에서 유도한다 — 어느 클론에 두든 그 클론 안에서 완결된다.
# (운영은 개발 체크아웃이 아니라 전용 클론에서 돈다. scripts/job-bootstrap.sh 주석 참고)
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO"
# shellcheck disable=SC1091
. "$REPO/scripts/job-bootstrap.sh"
job_bootstrap "$REPO"
export PATH="/Users/TakMD/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
exec npx tsx "$REPO/scripts/journal-collector/collect.ts"
