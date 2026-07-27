#!/bin/bash
# launchd에서 호출되는 래퍼. launchd의 PATH는 빈약하므로 필요한 경로를 명시한다.
# codex는 ~/.local/bin 에 있고 이게 없으면 LLM 호출이 통째로 실패한다.
set -euo pipefail

REPO="/Users/TakMD/workspace/spinoscopy-dashboard"
cd "$REPO"

export PATH="/Users/TakMD/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

SINCE="${1:-today}"
LOCK_DIR="/tmp/dakota-ledger.lock"
STAMP="$(date '+%Y-%m-%d %H:%M:%S')"

# launchd가 하루 6회, 겹치는 창으로 돈다. codex 호출이 멈추면(타임아웃 전까지 최대 5분)
# 다음 스케줄이 아직 살아있는 이 실행과 동시에 시작될 수 있다. 둘 다 dedup 스냅샷을
# 먼저 읽고 나중에 쓰면 세션 로그·과제가 두 번씩 적힌다.
#
# macOS에는 flock이 없다(GNU 유틸). mkdir은 POSIX에서 원자적이라 그것을 락으로 쓴다.
# 락을 못 잡으면 에러가 아니라 조용히 건너뛴다(exit 0) — 다음 스케줄 창이 곧 다시 온다.
acquire_lock() {
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    echo $$ > "$LOCK_DIR/pid"
    trap 'rm -rf "$LOCK_DIR"' EXIT
    return 0
  fi

  # 락이 남아 있다. 그 프로세스가 살아 있으면 양보하고, 죽었으면(크래시·강제종료) 회수한다.
  local old
  old="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
  if [ -n "$old" ] && kill -0 "$old" 2>/dev/null; then
    echo "=== $STAMP --since $SINCE : 이전 실행(pid $old)이 아직 돌고 있어 건너뜁니다 ==="
    return 1
  fi

  echo "=== $STAMP : 죽은 락 회수 (pid ${old:-unknown}) ==="
  rm -rf "$LOCK_DIR"
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    echo $$ > "$LOCK_DIR/pid"
    trap 'rm -rf "$LOCK_DIR"' EXIT
    return 0
  fi
  echo "=== $STAMP : 락 획득 실패, 건너뜁니다 ==="
  return 1
}

acquire_lock || exit 0

echo "=== $STAMP --since $SINCE ==="
npx tsx --env-file=.env.local scripts/dakota-ledger-sync.ts --since "$SINCE"
