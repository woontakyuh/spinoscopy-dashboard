# Spinoscopy Dashboard

## Overview
Dr. Woon Tak Yuh(척추 신경외과)의 개인 AI 대시보드. 7개 multi-agent로 구성.

- **Stack**: Next.js 16 + React 19 + TypeScript + Tailwind v4
- **Deploy**: Vercel (push to `main` → 자동 배포)
- **Dev**: `npm run dev` → `http://localhost:4321`
- **Build**: `npm run build`
- **Test**: `npm run test` (vitest)
- **Theme**: Dark mode only (`bg-zinc-950 text-white`)

## 6 Multi-Agents + Dakota Command Center

| Agent | Icon | Route | 역할 |
|-------|------|-------|------|
| Dakota | 🧠 | `/agents/dakota` | Chief of Staff / 일정·할일·발표·학회 + Agent Command Center |
| Elon | 🩺 | `/agents/elon` | 임상 운영, 환자/수술 workflow |
| Brian | 🔬 | `/agents/brian` | 연구, 논문, editorial/reviewer workflow |
| Andrej | 🛰️ | `/agents/andrej` | AI workflow, agent architecture, AI radar |
| Warren | 💰 | `/agents/warren` | 자산/사업/전략 필터 |
| Lo | 🥋 | `/agents/lo` | BJJ·수련·회복 rhythm |

Dakota 탭은 별도 ERP 앱이 아니라 이 `spinoscopy-dashboard` 안에서 확장되는 command-center layer다. Dakota가 front door로 받고 specialist agents가 병렬 참모 lane으로 움직이며, telemetry/approval/Knowledge Inbox는 `/agents/dakota`의 Command Center 탭에서 확인한다.

## ⚠️ 메인 체크아웃은 작업 공간이 아니다 (모든 세션 공통, 최우선)

`/Users/TakMD/workspace/spinoscopy-dashboard` 에서 **직접 파일을 고치지 않는다.**
브랜치 전환·stash 도 하지 않는다. 편집은 **반드시 worktree 에서** 한다.

```
편집할 게 있으면 → 먼저 worktree 생성 → 거기서 작업 → PR
```

**왜 —** 여러 세션이 이 한 폴더를 동시에 본다. 한 세션이 브랜치를 갈아끼우면 다른
세션의 미커밋 작업이 사라진다. 그리고 맥미니 launchd 잡들이 이 레포의 코드를
실행하므로, 체크아웃 상태가 곧 그날 새벽 수집·메일의 내용이 된다.
(2026-07~08 저널 수집 2주 정지가 이 계열의 사고였다.)

운영 잡은 이제 **전용 클론 `/Users/TakMD/workspace/spino-jobs`** 에서 돈다
(항상 `main`, 실행 직전 자동 pull). 그래도 메인 체크아웃을 작업 공간으로 쓰면
세션끼리 서로를 덮는 문제는 그대로 남는다.

worktree 는 한 곳에 모은다: `.claude/worktrees/` (`/private/tmp` 는 재부팅 시 소실).

## Agent-Specific Development (마스터 세션 워크플로우)

하나의 Claude Code 세션(마스터)에서 서브에이전트를 위임하여 병렬 개발한다.
각 multi-agent의 컨텍스트 파일: `.claude/agents/{name}.md`

### 작업 위임 프로세스
1. 사용자가 특정 에이전트 작업을 요청
2. `.claude/agents/{name}.md` 를 읽어 컨텍스트 확보
3. Task tool로 서브에이전트 호출:
   - `subagent_type: "general-purpose"`
   - `isolation: "worktree"` (독립 브랜치에서 작업)
   - 프롬프트에 해당 agent context 파일 내용 포함
4. 서브에이전트가 worktree에서 작업 완료
5. `feat/{agent}-{description}` 브랜치에 커밋 → PR 생성

### 병렬 작업
여러 에이전트 동시 작업 시, 각각 별도 Task를 동시에 호출.

### 안전한 병렬 조합 (충돌 없음)
- Vault, Sensei, Radar — 완전 독립, 어떤 조합이든 안전
- Clinicus, Scholar — 각각 독립 DB, 안전
- Dakota + Podium — ⚠️ Schedule DB 공유, 동시 작업 비권장

### Git 전략
- 브랜치: `feat/{agent}-{description}`
- Worktree: `isolation: "worktree"`로 자동 생성
- 머지: PR 기반 리뷰 후 main 머지

## 맥미니 운영 잡 (launchd)

수집·메일 잡 7개는 **`/Users/TakMD/workspace/spino-jobs`** (운영 전용 클론)에서 돈다.
개발 체크아웃과 완전히 분리돼 있어, 어느 브랜치에서 작업하든 운영에 영향이 없다.

- 각 `scripts/*/run*.sh` 는 REPO 를 **자기 위치에서 유도**한다 (경로 하드코딩 금지)
- `scripts/job-bootstrap.sh` 가 **main + 워킹트리 깨끗** 일 때만 `git pull` 한다
  → main 에 머지하면 다음 실행 때 자동 반영. 개발 체크아웃에서 돌려도 pull 되지 않는다.
- 배포 = main 머지. 맥미니에서 따로 할 일 없음.
- 맥스튜디오의 원문 워커(`fulltext-worker`)도 같은 방식으로 자기 클론을 최신화한다.

## Shared Code (수정 주의)

아래 파일은 여러 에이전트가 공유. 수정 시 전체 영향 확인 필요:

- `lib/notion/client.ts` — Notion API 베이스 클라이언트
- `lib/utils.ts` — `cn()` 유틸리티
- `components/ui/` — shadcn 공용 컴포넌트 (13개)
- `components/layout/` — Sidebar, TopBar, ClientLayout
- `components/dashboard/` — 홈 대시보드 위젯
- `app/layout.tsx` — 루트 레이아웃
- `app/page.tsx` — 대시보드 홈
- `app/api/ai/chat/route.ts` — 공용 Claude 채팅 (agentId로 분기)

## Agent Dependencies

```
Dakota ←→ Podium : NOTION_SCHEDULE_DB_ID 공유
                   Dakota: lib/notion/schedule.ts
                   Podium: lib/notion/podium.ts (getScheduleDbId())
```
다른 에이전트들은 서로 독립적 (공유 자원 없음).

## File Structure Pattern

각 에이전트는 이 구조를 따름:
```
app/agents/{name}/page.tsx          — 페이지 ("use client")
components/{name}/*.tsx             — UI 컴포넌트
app/api/{route}/route.ts            — API 라우트 (GET/POST)
lib/notion/{name}.ts                — Notion DB 쿼리
lib/types/{name}.ts                 — TypeScript 타입
lib/{name 또는 ai}/*.ts             — 비즈니스 로직 (선택)
```

## API Route Pattern

```typescript
// GET: 목록 조회
export async function GET() {
  try {
    const data = await queryFunction()
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST: 생성/처리
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    // validate → process → respond
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

## Coding Conventions

- 한글 사용: UI 텍스트, 에러 메시지, 주석 모두 한글 가능
- Notion 쿼리: `notionRequest()` from `lib/notion/client.ts`
- State: Zustand (클라이언트), React Query (서버 상태)
- Forms: React Hook Form + Zod
- AI: Claude via `@ai-sdk/anthropic`, Groq via direct API
- Styling: Tailwind v4 utility classes, zinc 계열 다크 팔레트

## Environment Variables

```
NOTION_TOKEN                — Notion API
NOTION_PATIENT_DB_ID        — Clinicus
NOTION_JOURNAL_DB_ID        — Scholar
NOTION_SCHEDULE_DB_ID       — Dakota + Podium (공유)
NOTION_TODO_DB_ID           — Dakota
NOTION_SENSEI_DB_ID         — Sensei
ANTHROPIC_API_KEY           — Claude AI
GROQ_API_KEY                — Groq (파싱/요약)
GOOGLE_CLIENT_ID/SECRET     — Google Calendar
DASHBOARD_PASSWORD          — 로그인
```
