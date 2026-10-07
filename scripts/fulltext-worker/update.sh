#!/bin/bash
# 맥스튜디오 원문 워커 업데이트 — 고용산 교수님이 터미널에 한 줄 붙여넣어 실행:
#
#   curl -fsSL https://raw.githubusercontent.com/woontakyuh/spinoscopy-dashboard/main/scripts/fulltext-worker/update.sh | bash
#
# 하는 일: 최신 코드로 맞춤 → 의존성 → 워커 재시작 → 결과 확인.
# zip 으로 설치된 폴더도 git 저장소로 바꿔 둔다. 그 뒤로는 워커가 새 코드를 스스로
# 받아오므로(30분마다 확인) 이 스크립트를 다시 돌릴 일이 거의 없다.
# .env.local(비밀 설정)과 node_modules 는 건드리지 않는다.
set -euo pipefail

REPO="${SPINO_REPO:-$HOME/spinoscopy-dashboard}"
URL="https://github.com/woontakyuh/spinoscopy-dashboard.git"
LABEL="com.spino.fulltext-worker"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="${SPINO_WORKER_LOG:-/tmp/fulltext-worker.log}"

say() { printf '%s\n' "$*"; }
die() { say "❌ $*"; say "   이 화면을 캡처해 센터장님께 보내주세요."; exit 1; }

say "──────────────────────────────────────────────"
say " 원문 워커 업데이트  ($REPO)"
say "──────────────────────────────────────────────"

[ -d "$REPO" ] || die "워커 폴더가 없습니다: $REPO"
[ -f "$REPO/.env.local" ] || die "설정파일(.env.local)이 없습니다 — 워커 폴더 위치가 다른 것 같습니다."
command -v git >/dev/null 2>&1 || die "git 이 없습니다. 'xcode-select --install' 로 설치한 뒤 다시 실행해 주세요."
cd "$REPO"

before="$(git rev-parse --short HEAD 2>/dev/null || echo 'zip설치')"
[ -d .git ] || { say "· zip 설치본 → git 저장소로 전환"; git init -q; }
git remote get-url origin >/dev/null 2>&1 || git remote add origin "$URL"
git remote set-url origin "$URL"
git fetch -q origin main || die "코드를 내려받지 못했습니다(인터넷 연결 확인)."
# 워커 전용 폴더라 로컬 수정은 없어야 정상이다. 있더라도 버리고 main 에 맞춘다 —
# 남아 있으면 자동 업데이트(main + 깨끗한 트리일 때만 pull)가 영영 멈춘다.
git symbolic-ref HEAD refs/heads/main
git reset -q --hard origin/main
git branch -q --set-upstream-to=origin/main main
after="$(git rev-parse --short HEAD)"
say "✓ 코드: $before → $after"

# 저장소에 없는 파일이 섞여 있어도 자동 업데이트가 멈춘다. 지우지 않고 옆으로 옮겨 둔다.
stray="$(git ls-files --others --exclude-standard)"
if [ -n "$stray" ]; then
  backup="$HOME/spino-worker-backup-$(date +%Y%m%d-%H%M%S)"
  say "· 저장소 밖 파일을 $backup 로 옮김"
  while IFS= read -r f; do
    mkdir -p "$backup/$(dirname "$f")"
    mv "$f" "$backup/$f"
  done <<< "$stray"
fi

say "· 의존성 확인 중… (1~2분)"
npm ci --no-audit --no-fund >/tmp/fulltext-npm-install.log 2>&1 \
  || die "의존성 설치 실패 (로그: /tmp/fulltext-npm-install.log)"
say "✓ 의존성"

# plist 가 옛 경로(예: Downloads)를 가리키면 run.sh 를 못 찾는다 — 이 폴더로 다시 쓴다.
if ! grep -q "$REPO/scripts/fulltext-worker/run.sh" "$PLIST" 2>/dev/null; then
  say "· 자동실행 등록을 이 폴더로 갱신"
  mkdir -p "$(dirname "$PLIST")"
  cp "$REPO/scripts/fulltext-worker/$LABEL.plist" "$PLIST"
  /usr/bin/sed -i '' "s#/Users/TakMD/workspace/spinoscopy-dashboard#$REPO#" "$PLIST"
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"
else
  launchctl kickstart -k "gui/$(id -u)/$LABEL" 2>/dev/null || { launchctl unload "$PLIST" 2>/dev/null || true; launchctl load "$PLIST"; }
fi

say "· 재시작 확인 중… (최대 60초)"
for _ in $(seq 1 30); do
  sleep 2
  if grep -q "시작 v$after" "$LOG" 2>/dev/null; then
    say "──────────────────────────────────────────────"
    say "✅ 완료! 워커가 새 버전($after)으로 돌고 있습니다."
    say "   앞으로는 새 코드가 나오면 워커가 스스로 받아옵니다."
    say "──────────────────────────────────────────────"
    exit 0
  fi
done
say "⚠️  재시작 확인을 못 했습니다. 마지막 로그:"
tail -15 "$LOG" 2>/dev/null || true
die "워커가 새 버전으로 뜨지 않았습니다."
