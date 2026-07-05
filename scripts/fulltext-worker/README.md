# 원문 확보 워커 (fulltext-worker)

Scholar 논문 큐(`원문 요청`=true, `원문 상태`∈{요청됨,비어있음})를 소진하며
OA→원내망(Aside-Chrome) 순으로 PDF를 확보, Dropbox 공유 폴더에 올리고
Notion `원문 상태`/`원문 PDF`를 갱신한다.

## 구조
- `drain.ts` — 큐 1회 소진(export `drainQueue`).
- `daemon.ts` — 상주 데몬: Ably 트리거(즉시) + 백업 폴링(기본 5분) + 중복기동 뮤텍스.

## env (.env.local)
- `NOTION_TOKEN`, `NOTION_JOURNAL_DB_ID` — 기존
- Dropbox 인증(둘 중 하나):
  - 권장(장기): `DROPBOX_REFRESH_TOKEN` + `DROPBOX_APP_KEY` + `DROPBOX_APP_SECRET` — 자동 갱신, 24/7용
  - 개발(단기): `DROPBOX_TOKEN` — Generated access token(약 4h 만료)
- `DROPBOX_SCHOLAR_DIR` — Dropbox-상대 폴더(예 `/Scholar PDFs`)
- `ABLY_API_KEY` — Ably 앱 키(없으면 폴링만으로 동작)
- `UNPAYWALL_EMAIL` — 선택(기본 woontak.yuh@gmail.com)
- `FULLTEXT_DAILY_MAX` — per-run 상한(기본 20)
- `FULLTEXT_POLL_MS` — 백업 폴링 간격(기본 300000=5분)

## 수동 실행 (개발/검증)
    set -a; . ./.env.local; set +a
    # 큐 1회 소진만:
    npx tsx -e "import('./scripts/fulltext-worker/drain').then(m=>m.drainQueue())"
    # 데몬 전체(Ctrl+C로 종료):
    npx tsx scripts/fulltext-worker/daemon.ts

## launchd 등록 (상시)
    cp scripts/fulltext-worker/com.spino.fulltext-worker.plist ~/Library/LaunchAgents/
    launchctl load ~/Library/LaunchAgents/com.spino.fulltext-worker.plist
    tail -f /tmp/fulltext-worker.log

## Phase 2 (경북대 맥스튜디오)
- Aside 앱 + 로그인 Chrome(원내망 IP 확인) + Node/tsx 설치.
- run.sh 의 REPO 경로 수정.
- 맥미니의 워커는 OA만 처리(원내망 권한 없음) → 맥스튜디오로 이관하면 구독형까지 확보.
- 동시 두 곳에서 돌리면 큐가 겹치므로, 이관 후 맥미니 plist는 unload 한다.
