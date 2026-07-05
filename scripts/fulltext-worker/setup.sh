#!/bin/bash
# 맥스튜디오(경북대 원내망) 원문 확보 워커 원클릭 셋업.
# clone된 repo 안에서 실행:  bash scripts/fulltext-worker/setup.sh
# 하는 일: 의존성 설치 → .env.local 확인 → launchd 등록(이 맥 경로로) → 셀프테스트 → 상시 가동.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO"
echo "──────────────────────────────────────────────"
echo " 원문 확보 워커 셋업"
echo " 레포: $REPO"
echo "──────────────────────────────────────────────"

# 1) Node 확인
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js가 없습니다."
  echo "   https://nodejs.org 에서 'LTS' 버전을 설치한 뒤 이 스크립트를 다시 실행하세요."
  exit 1
fi
echo "✓ Node $(node -v)"

# 2) Aside CLI 확인(원내망 PDF 취득에 필수) — 없으면 경고만(OA는 없이도 됨)
if command -v aside >/dev/null 2>&1; then
  echo "✓ aside 명령 확인됨"
else
  echo "⚠️  'aside' 명령을 못 찾음 — Aside 앱 설치/실행 및 Chrome 연결이 필요합니다."
  echo "    (유료 논문 취득은 Aside가 있어야 동작. 지금은 계속 진행하되, 나중에 Aside 세팅 후 재확인)"
fi

# 3) 의존성 설치
echo "· 의존성 설치 중… (처음엔 몇 분 걸릴 수 있습니다)"
npm install --no-audit --no-fund >/tmp/fulltext-npm-install.log 2>&1 || {
  echo "❌ npm install 실패. 로그: /tmp/fulltext-npm-install.log"; exit 1; }
echo "✓ 의존성 설치 완료"

# 4) .env.local 확인
if [ ! -f "$REPO/.env.local" ]; then
  echo "❌ .env.local 이 없습니다."
  echo "   센터장님이 보내준 내용을 아래 위치에 저장한 뒤 다시 실행하세요:"
  echo "     $REPO/.env.local"
  echo "   (필요한 키: NOTION_TOKEN, NOTION_JOURNAL_DB_ID, DROPBOX_TOKEN, DROPBOX_SCHOLAR_DIR)"
  exit 1
fi
# 필수 키 존재 점검
missing=""
for k in NOTION_TOKEN NOTION_JOURNAL_DB_ID DROPBOX_TOKEN DROPBOX_SCHOLAR_DIR; do
  grep -q "^$k=" "$REPO/.env.local" || missing="$missing $k"
done
if [ -n "$missing" ]; then
  echo "❌ .env.local 에 다음 키가 없습니다:$missing"
  exit 1
fi
echo "✓ .env.local 확인(필수 키 모두 있음)"

chmod +x "$REPO/scripts/fulltext-worker/run.sh"

# 5) launchd plist 생성(이 맥 경로로)
PLIST="$HOME/Library/LaunchAgents/com.spino.fulltext-worker.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.spino.fulltext-worker</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$REPO/scripts/fulltext-worker/run.sh</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/fulltext-worker.log</string>
  <key>StandardErrorPath</key><string>/tmp/fulltext-worker.log</string>
</dict></plist>
PLISTEOF
echo "✓ launchd 등록파일 생성: $PLIST"

# 6) 셀프 테스트 — 큐 1회 드레인(대기 중 요청 처리 시도)
echo "· 셀프 테스트: 큐 1회 처리 시도…"
set -a; . "$REPO/.env.local"; set +a
npx tsx -e "import('$REPO/scripts/fulltext-worker/drain.ts').then(m=>m.drainQueue()).then(n=>console.log('  → 처리:',n,'건(대기 요청이 없으면 0이 정상)')).catch(e=>{console.error('  ❌ 실패:',e.message);process.exit(1)})"

# 7) 상시 가동 등록
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "──────────────────────────────────────────────"
echo "✅ 완료! 워커가 상시 가동됩니다(맥 재부팅해도 자동 시작)."
echo "   로그 보기:   tail -f /tmp/fulltext-worker.log"
echo "   이제 센터장님/교수님이 Notion에서 '원문 요청'을 켜면"
echo "   이 맥스튜디오가 받아서 공유 Dropbox 폴더에 저장합니다."
echo "──────────────────────────────────────────────"
