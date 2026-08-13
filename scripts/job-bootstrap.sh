#!/bin/bash
# scripts/job-bootstrap.sh
# 모든 launchd 잡의 공통 진입 준비. 각 run 스크립트가 자기 위치에서 REPO 를 정한 뒤
# 이 파일을 source 하고 job_bootstrap "$REPO" 를 부른다.
#
# 왜 생겼나 —
# 예전엔 잡들이 개발 체크아웃 경로(/Users/TakMD/workspace/spinoscopy-dashboard)를
# 하드코딩해 실행했다. 그 폴더는 세션들이 브랜치를 수시로 갈아끼우는 작업 공간이라,
# "그날 새벽 무슨 브랜치가 체크아웃돼 있었나" 에 따라 수집·메일 내용이 달라졌다.
# (2026-07~08 저널 수집 2주 정지도 이 계열의 사고였다.)
#
# 이제 운영은 전용 클론 /Users/TakMD/workspace/spino-jobs 에서 돈다. 경로를 스크립트
# 위치에서 유도하므로 어느 클론에 두든 그 클론 안에서 완결된다.
#
# 주의: .gitignore 에 `scripts/*` 가 있어 이 파일은 `!scripts/job-bootstrap.sh`
# 예외로 추적된다. 여기에 파일을 추가할 땐 예외를 같이 넣어야 한다 — 안 그러면
# git add 가 조용히 삼키고, 잡 전체가 다음 실행에서 source 실패로 죽는다.

# main 이고 워킹트리가 깨끗할 때만 최신 코드를 당겨온다.
#
# 이 조건이 곧 "여기는 운영 클론인가?" 판정이다. 개발 체크아웃은 대개 기능 브랜치이거나
# 미커밋 변경이 있으므로 자동으로 걸러진다 — 실수로 개발 폴더에서 잡을 돌려도
# 남의 작업을 pull 로 덮지 않는다.
job_pull_if_ops() {
  local repo="$1"
  local branch
  branch="$(git -C "$repo" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  if [ "$branch" != "main" ]; then
    echo "[bootstrap] $branch 브랜치 — pull 생략(운영 클론 아님)"
    return 0
  fi
  if [ -n "$(git -C "$repo" status --porcelain 2>/dev/null)" ]; then
    echo "[bootstrap] 미커밋 변경 있음 — pull 생략"
    return 0
  fi
  # pull 실패로 잡을 죽이지 않는다. 네트워크가 잠깐 나갔다고 그날 수집을 통째로
  # 건너뛰는 것보다, 어제 코드로라도 도는 편이 낫다.
  if git -C "$repo" pull --ff-only --quiet 2>/dev/null; then
    echo "[bootstrap] main 최신화 완료 ($(git -C "$repo" rev-parse --short HEAD))"
  else
    echo "[bootstrap] pull 실패 — 기존 코드로 진행 ($(git -C "$repo" rev-parse --short HEAD))"
  fi
}

# .env.local 로드. 없으면 즉시 실패시킨다 — 키 없이 반쯤 돌다 조용히 빈 결과를
# 내는 게 제일 나쁘다.
job_load_env() {
  local repo="$1"
  if [ ! -f "$repo/.env.local" ]; then
    echo "[bootstrap] .env.local 이 없다: $repo" >&2
    return 1
  fi
  set -a
  # shellcheck disable=SC1091
  . "$repo/.env.local"
  set +a
}

job_bootstrap() {
  local repo="$1"
  job_pull_if_ops "$repo"
  job_load_env "$repo"
}
