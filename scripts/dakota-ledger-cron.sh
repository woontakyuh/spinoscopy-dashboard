#!/bin/bash
# launchd에서 호출되는 래퍼.
#
# 전용 러너 워크트리에서 돈다. 주 체크아웃(spinoscopy-dashboard)은 센터장님이
# 브랜치를 옮겨가며 작업하는 곳이라, 거기서 돌리면 낡은 코드로 적재된다 —
# 실제로 2026-08-01에 그 일이 나서 세션 14건이 Surface 없이 들어갔다.
# 러너는 매 실행마다 origin/main으로 맞춘다.
#
# launchd의 PATH는 빈약하다. codex는 ~/.local/bin 에 있고 없으면 LLM 호출이 통째로 실패한다.
set -euo pipefail

RUNNER="/Users/TakMD/workspace/spinoscopy-dashboard-ledger-runner"
cd "$RUNNER"

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

# 러너를 origin/main에 맞춘다. 실패해도 이전 코드로 계속 돈다(적재가 멈추는 것보다 낫다).
if git fetch -q origin main 2>/dev/null && git checkout -q --detach origin/main 2>/dev/null; then
  echo "  코드: $(git log --oneline -1)"
else
  echo "  경고: origin/main 동기화 실패, 현재 체크아웃으로 진행 — $(git log --oneline -1)"
fi

# 네 면을 모두 돌린다. 하나가 실패해도 나머지는 시도한다.
run() {
  local label="$1"; shift
  echo "--- $label ---"
  if ! "$@"; then echo "  ! $label 실패 (계속 진행)"; fi
}

run "Hermes"       npx tsx --env-file=.env.local scripts/dakota-ledger-sync.ts --since "$SINCE"
run "To-Do"        npx tsx --env-file=.env.local scripts/dakota-todo-sync.ts
run "Conversation" npx tsx --env-file=.env.local scripts/dakota-conversation-sync.ts
run "Wiki"         npx tsx --env-file=.env.local scripts/dakota-wiki-sync.ts
