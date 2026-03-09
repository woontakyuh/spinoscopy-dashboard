# Spinoscopy Dashboard

## Overview
Dr. Woon Tak Yuh(척추 신경외과)의 개인 AI 대시보드. 7개 multi-agent로 구성.

- **Stack**: Next.js 16 + React 19 + TypeScript + Tailwind v4
- **Deploy**: Vercel (push to `main` → 자동 배포)
- **Dev**: `npm run dev` → `http://localhost:4321`
- **Build**: `npm run build`
- **Test**: `npm run test` (vitest)
- **Theme**: Dark mode only (`bg-zinc-950 text-white`)

## 7 Multi-Agents

| Agent | Icon | Route | 역할 |
|-------|------|-------|------|
| Clinicus | 🩺 | `/agents/clinicus` | 환자 PROM 관리, 임상 데이터 |
| Scholar | 🔬 | `/agents/scholar` | 저널 논문 검색/관리, 알림 |
| Podium | 🏆 | `/agents/podium` | 학회 발표/컨퍼런스 관리 |
| Jarvis | 📋 | `/agents/jarvis` | 일정 & 할일 관리 (NLP) |
| Vault | 💰 | `/agents/vault` | 자산/재무 추적 |
| Sensei | 🥋 | `/agents/sensei` | BJJ 훈련 로그 |
| AI Radar | 🛰️ | `/agents/radar` | AI 뉴스 피드 집계 |

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
- Jarvis + Podium — ⚠️ Schedule DB 공유, 동시 작업 비권장

### Git 전략
- 브랜치: `feat/{agent}-{description}`
- Worktree: `isolation: "worktree"`로 자동 생성
- 머지: PR 기반 리뷰 후 main 머지

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
Jarvis ←→ Podium : NOTION_SCHEDULE_DB_ID 공유
                   Jarvis: lib/notion/schedule.ts
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
NOTION_SCHEDULE_DB_ID       — Jarvis + Podium (공유)
NOTION_TODO_DB_ID           — Jarvis
NOTION_SENSEI_DB_ID         — Sensei
ANTHROPIC_API_KEY           — Claude AI
GROQ_API_KEY                — Groq (파싱/요약)
GOOGLE_CLIENT_ID/SECRET     — Google Calendar
DASHBOARD_PASSWORD          — 로그인
```
