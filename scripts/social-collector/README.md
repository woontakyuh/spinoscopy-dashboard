# social-collector (맥 mini 전용)

AI Radar 소셜 컬럼용 수집기. Threads/X 공개 글을 긁어 Notion "Social Feed" DB에 적재한다.
대시보드(Vercel)와 **격리**된 자체 패키지 — playwright가 대시보드 빌드에 들어가지 않게.

스펙: `docs/superpowers/specs/2026-06-22-radar-social-column-design.md`

## 동작

- **Threads** `@choi.openai` → Playwright(시스템 Chrome, headless) 렌더 → DOM 추출
- **X** `@karpathy` → `syndication.twitter.com` timeline-profile 파싱
- 정규화 → 기존 PostId 제외(중복제거) → Notion `pages` insert
- 한 플랫폼 실패(예: X 429)는 다른 쪽·기존 데이터에 영향 없음(graceful skip)

## 설치 (맥)

```bash
cd scripts/social-collector
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i   # 시스템 Chrome(channel:"chrome") 사용
```

## 필요 env (repo 루트 `.env.local`)

```
NOTION_TOKEN=...                # 기존 통합 토큰
NOTION_SOCIAL_DB_ID=...         # Social Feed DB (setup-notion-db.mjs로 생성)
```

DB 생성(최초 1회): `NOTION_TOKEN=... REF_DB=<접근가능한 기존 DB id> node setup-notion-db.mjs`
→ 출력된 id를 `.env.local`의 `NOTION_SOCIAL_DB_ID`와 **Vercel 환경변수**에 넣는다.

## 수동 실행 / 테스트

```bash
node collect.mjs     # 1회 수집 (env 필요)
node --test          # 정규화/중복제거 단위 테스트
```

## 자동 실행 (launchd, 1시간)

`~/Library/LaunchAgents/com.spino.social-collector.plist` (StartInterval 3600, RunAtLoad).
`run.sh`가 `.env.local` 로드 후 `collect.mjs` 실행. 로그: `/tmp/social-collector.log`.

```bash
launchctl load   ~/Library/LaunchAgents/com.spino.social-collector.plist
launchctl unload ~/Library/LaunchAgents/com.spino.social-collector.plist   # 중지
```

## 알려진 한계

- **X syndication은 IP 레이트리밋(429)**이 잦다. 그 회차는 스킵되고 다음 시간에 재시도된다.
  지속적으로 막히면 백오프/대체 경로(로그인 세션 등) 검토 필요.
- Threads 본문에 계정명·상대시각·인용글 일부가 섞일 수 있다(DOM 컨테이너 특성). 본문은 보존됨 — 정제는 후속 개선 여지.
- 공개(로그아웃) 글 한정. 과거 글 대량 백필은 범위 밖.
