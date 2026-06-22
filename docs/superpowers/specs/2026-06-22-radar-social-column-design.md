# AI Radar 소셜 컬럼 — Threads + X 피드 추가

- 작성일: 2026-06-22
- 상태: 설계 승인 (구현 대기)
- 대상 에이전트: AI Radar (🛰️) — `app/api/ai-feed/route.ts`, `lib/radar/*`, `components/radar/*`

## 배경 / 목표

AI Radar는 현재 RSS/Atom/HTML로 20여 개 AI 뉴스 소스를 집계한다(서버에서 단순 HTTP fetch).
여기에 **소셜 피드**를 추가한다:
- **Threads** `@choi.openai` (한국어 AI 채널)
- **X** `@karpathy` (Andrej Karpathy, 영문)

표시: 기존 AI Radar 피드 옆 **별도 "소셜" 컬럼** (같은 radar 페이지, 한 화면).

## 핵심 제약 (설계를 규정)

- 대시보드는 **Vercel 서버리스** 배포. 기존 소스는 HTTP fetch라 OK.
- **Threads**는 JS 렌더링/로그인월 → 실제 브라우저 필요 (curl 32회 challenge로 검증됨). Vercel 함수에서 브라우저 구동 불가.
- **X**는 무로그인 syndication HTTP 엔드포인트가 있으나 데이터센터 IP(Vercel)에선 403/429 잦음.

→ **결정: 무거운 수집은 맥 mini(24/7 서버)에서, 대시보드는 Notion만 읽는다.**
맥은 아웃바운드(스크래핑 + Notion 쓰기)만 하므로 인바운드 차단/터널 이슈와 무관
([[elon-parked]]의 병원 브라우저 차단과 대비되는 지점).

## 아키텍처 / 데이터 흐름

```
[맥 mini · launchd 1h] scripts/social-collector  (자체 package.json, playwright 포함)
   ├─ Threads @choi.openai → Playwright(시스템 Chrome, headless) 렌더 → DOM 추출
   └─ X @karpathy          → syndication timeline 파싱 (주거용 IP라 덜 막힘)
   → 정규화 → Notion "Social Feed" DB upsert (PostId로 중복제거)
        ↓ (아웃바운드만)
[Vercel] app/api/social-feed/route.ts → Notion 읽어 SocialItem[] 반환 (순수 HTTP)
        ↓
[radar 페이지] components/radar/SocialColumn.tsx — AI Radar 피드 옆 컬럼
```

- 수집기는 대시보드 repo `scripts/social-collector/`에 **자체 node_modules/package.json**으로 격리
  → Vercel 빌드에 playwright가 들어가지 않음(앱 코드가 import 안 함).
- 대시보드는 **라이브 스크래핑에 절대 의존하지 않음** — 항상 Notion에 저장된 것만 읽음.

## 구성요소

### A. Notion "Social Feed" DB (신규, env: `NOTION_SOCIAL_DB_ID`)

| 속성 | 타입 | 비고 |
|------|------|------|
| Title | title | 글 첫 줄/요약 (Notion 목록 가독용) |
| Platform | select | `threads` / `x` |
| Account | rich_text | `choi.openai` / `karpathy` |
| PostId | rich_text | 중복제거 키 (Threads 글 코드 / 트윗 id) |
| URL | url | 원글 permalink |
| FullText | rich_text | 본문 전체 (요약 버튼이 이걸로 동작 — 재스크래핑 불필요) |
| PostedAt | date | 작성 시각 (best-effort) |
| CollectedAt | date | 수집 시각 |

- **중복제거**: 매 실행 시 DB에서 최근 PostId 집합을 읽어, 없는 것만 insert.

### B. 수집기 `scripts/social-collector/` (맥 전용, best-effort)

- **공통**: 정규화 함수 → `{platform, account, postId, url, fullText, postedAt}`. Notion upsert는 `lib/notion/client.ts`의 `notionRequest()` 재사용(또는 동등 호출).
- **Threads** (`collectThreads`): headless Chrome(`channel: 'chrome'`)로 `https://www.threads.com/@choi.openai` 로드 → 대기 → `[data-pressable-container]`에서 본문·permalink(`/@account/post/<code>`)·시각 추출. 스크롤로 최근 ~20개. (검증된 방식)
- **X** (`collectX`): `https://syndication.twitter.com/srv/timeline-profile/screen-name/karpathy` 파싱 → 트윗 id·본문·시각·URL. 실패(403/429) 시 그 회차만 스킵 + 로그.
- **실패 격리**: 한 플랫폼이 실패해도 다른 쪽/기존 Notion 데이터는 보존. 절대 DB를 비우지 않음.
- 시크릿: `NOTION_TOKEN`, `NOTION_SOCIAL_DB_ID` (맥 로컬 env).

### C. 대시보드 읽기 (Vercel)

- `lib/types/social.ts` — `SocialItem { platform: "threads"|"x"; account: string; lang: "ko"|"en"; text: string; url: string; postedAt: string }`. FeedItem과 **분리**(소셜은 importanceScore/category 불필요).
- 소스 메타: 계정별 `lang` 매핑 (`choi.openai`→`ko`, `karpathy`→`en`).
- `lib/notion/social.ts` — Notion "Social Feed" 최근순 N개 쿼리 → `SocialItem[]`.
- `app/api/social-feed/route.ts` — GET, Notion 읽어 반환 (기존 API 라우트 패턴, no-store/revalidate).
- `components/radar/SocialColumn.tsx` — Threads/X 카드(본문·계정·플랫폼·시각·원글 링크). radar 페이지에 컬럼으로 배치.

### D. 한글 요약 버튼 (영문 계정용)

- SocialColumn 카드에서 **`lang !== "ko"`일 때만 `[한글 요약]` 버튼** 노출.
- 클릭 → `POST /api/social-feed/summarize { text }` → Claude가 한글 번역·요약·정리 → 카드 하단 표시.
- 컴포넌트 상태에 캐시(완료 후 재클릭 방지) — 기존 `FeedCard`의 "AI 요약" UX와 동일.
- `app/api/social-feed/summarize/route.ts` — 소셜 전용(카테고리/중요도 없음, 번역·요약만). `ai-feed/summarize`와 분리하되 동일 Claude 클라이언트 패턴.

### E. 운영

- launchd 1h 타이머 (elon `com.spino.elon` 패턴). 맥 24/7 서버 → 누락 거의 없음.
- Vercel env에 `NOTION_SOCIAL_DB_ID` 추가.

## 에러 처리

- 수집기: 플랫폼별 try/catch, 실패는 로그만 — 다른 플랫폼·기존 데이터 영향 없음.
- 읽기 API: Notion 실패 시 빈 배열 또는 직전 캐시 → 소셜 컬럼만 비고, AI Radar 본 피드는 정상.
- 요약 API: 실패 시 카드에 "요약 실패" 표시(기존 FeedCard 동일).

## 테스트

- `scripts/social-collector`: 정규화·중복제거(PostId 기준 신규만 선별) 단위 테스트. (네트워크 호출은 목/픽스처)
- `lib/notion/social`: Notion 응답 → SocialItem 매핑 테스트.
- `app/api/social-feed`: 라우트가 SocialItem[] 반환하는지 (Notion 목).

## 범위 밖 (YAGNI)

- 계정 추가(현재 Threads 1 + X 1). 추가는 소스 메타 + lang 매핑에 한 줄.
- 무한 스크롤로 과거 글 대량 백필(현재 최근분만).
- 로그인 세션 기반 수집(공개분으로 충분; 위험·ToS 회피).
- 소셜 글의 중요도 스코어링/카테고리 분류.
- 실시간 푸시(1h 폴링으로 충분).
