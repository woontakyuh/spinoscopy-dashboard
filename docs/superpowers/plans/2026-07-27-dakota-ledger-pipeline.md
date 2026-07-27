# Dakota 운영 장부 파이프라인 Implementation Plan (Plan A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `~/.hermes/state.db`에 이미 쌓여 있는 3개월치 세션을 Notion 운영 장부(과제 칸반 + 세션 로그)로 자동 승격시켜, "언제 어떤 일을 했는지"를 Notion 뷰만으로 조회할 수 있게 만든다.

**Architecture:** raw 레이어는 복제하지 않고 `state.db`를 읽기 전용으로 조회한다. 순수 로직(Origin 분류 · 날짜 그룹핑 · 컨텍스트 절삭 · 집계)을 Notion/LLM 어댑터와 분리해 전부 단위 테스트한다. LLM은 주입 가능한 함수로 감싸 테스트에서 대체한다. 승격 스크립트는 Mac mini의 launchd로 돌고, Vercel 대시보드는 Notion만 읽는다.

**Tech Stack:** TypeScript · Node 22 `node:sqlite` (내장, 추가 의존성 없음) · tsx · vitest · Notion REST API 2022-06-28 · `ai` + `@ai-sdk/anthropic` (`generateObject`) · zod · launchd

원본 설계: `docs/superpowers/specs/2026-07-27-dakota-operations-ledger-design.md`

## Global Constraints

- Notion API 버전은 `2022-06-28` 고정. 모든 호출은 `lib/notion/client.ts`의 `notionRequest<T>()`를 경유한다. `fetch`를 직접 부르지 않는다.
- `~/.hermes/state.db`는 **읽기 전용**으로만 연다 (`new DatabaseSync(path, { readOnly: true })`). 쓰기·스키마 변경 금지.
- 승격 대상 source는 `telegram` · `cli` · `tui` · `subagent` 4종. **`cron`은 어떤 경로로도 편입하지 않는다.**
- 승격 대상 필터는 `message_count >= 3`.
- Origin은 `지시` · `논의` · `수행` 세 값만 사용한다 (한글 문자열 그대로).
- **Origin이 `수행`인 세션은 절대 신규 과제를 만들지 않는다.** 기존 과제 매칭에 실패하면 `Operation`을 비운다.
- Domain은 9개 고정: `Strategy` `Clinical` `Research` `AI` `Finance` `Training` `Family` `Personal` `Operations`.
- 타임존은 `Asia/Seoul`. 날짜 그룹핑·`--since` 해석 모두 KST 기준.
- 재실행 안전성: 적재 전 항상 `Session Key`로 기존 행을 조회해 제외한다.
- 세션당 LLM 입력은 2,000자로 절삭한다. 하루 세션이 10건을 넘으면 `Msg Count` 상위 10건만 상세, 나머지는 제목만 보낸다.
- 테스트: `npm run test` (vitest, `environment: node`, `globals: true`, alias `@` → 저장소 루트). 테스트 파일은 대상 옆에 `*.test.ts`로 둔다 (`lib/utils.test.ts` · `lib/notion/fulltext.test.ts` 관례).
- 커밋은 태스크마다. 브랜치는 `feat/dakota-ledger-pipeline`.

## 스펙 대비 의도적 이탈

| 스펙 | 계획 | 이유 |
|---|---|---|
| `OPS ID` (unique_id) | **제외** | Notion API 2022-06-28은 `unique_id` 속성 생성을 지원하지 않는다. `page_id`가 이미 안정 참조키다. |
| `Session Count` / `Msg Total` = rollup | **number 속성 + sync가 기록** | rollup 함수명이 API 버전별로 갈려 실패 위험이 크다. sync가 이미 값을 알고 있으므로 직접 쓴다. `Sessions` relation은 탐색용으로 그대로 유지. |

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/dakota-ledger/types.ts` | 파이프라인 공유 타입. Notion·LLM 의존 없음 |
| `lib/dakota-ledger/sessionSource.ts` | `state.db` 읽기 전용 조회 → `RawSession[]` |
| `lib/dakota-ledger/classify.ts` | Origin 휴리스틱 · KST 날짜 그룹핑 · 컨텍스트 절삭. 순수 함수만 |
| `lib/dakota-ledger/promote.ts` | 하루치 세션 → LLM → 검증된 승격 결과. LLM 함수 주입 |
| `lib/notion/sessionLog.ts` | Session Log DB 조회/생성 어댑터 |
| `lib/notion/operations.ts` | **기존 수정.** 확장 속성 매핑 추가 |
| `scripts/dakota-ledger-schema.ts` | Notion 스키마 1회성 구축 (멱등) |
| `scripts/dakota-ledger-sync.ts` | CLI 진입점. 위 모듈을 조립 |
| `lib/orchestrator/notionEventStore.ts` | **기존 수정.** Memory DB 오염 분리 |

`sessionSource` / `classify` / `promote`는 Notion 관심사가 아니므로 `lib/notion/` 밖에 둔다 (`lib/orchestrator`, `lib/journal-alert` 관례를 따름).

## 환경 변수

`.env.local`에 추가한다.

```
NOTION_DAKOTA_OPERATIONS_DB_ID=3aa908af25b981d99b1bc0017675c0a0
NOTION_DAKOTA_SESSION_LOG_DB_ID=      # Task 1에서 생성 후 기입
HERMES_STATE_DB=/Users/TakMD/.hermes/state.db
DAKOTA_LEDGER_MODEL=claude-sonnet-5
```

`NOTION_TOKEN`과 `ANTHROPIC_API_KEY`는 이미 설정되어 있다.

---

### Task 1: Notion 스키마 구축

Session Log DB를 만들고 Operations를 확장한다. 이후 모든 태스크가 이 스키마에 의존한다.

**Files:**
- Create: `scripts/dakota-ledger-schema.ts`

**Interfaces:**
- Consumes: `notionRequest` from `lib/notion/client.ts`
- Produces: Notion에 `Dakota Session Log` DB. 그 ID를 stdout으로 출력 → `NOTION_DAKOTA_SESSION_LOG_DB_ID`에 기입. Operations에 `Tags` `Started At` `Last Touched` `Sessions` `Session Count` `Msg Total` `Days Stalled` `Lead Time` 속성과 `Finance` `Training` Domain 옵션 추가.

- [ ] **Step 1: 브랜치 생성**

```bash
cd /Users/TakMD/workspace/spinoscopy-dashboard
git checkout -b feat/dakota-ledger-pipeline
```

- [ ] **Step 2: 스키마 스크립트 작성**

`scripts/dakota-ledger-schema.ts`:

```typescript
import { notionRequest } from "../lib/notion/client"

const OPERATIONS_DB_ID = process.env.NOTION_DAKOTA_OPERATIONS_DB_ID
const PARENT_PAGE_ID = "310908af-25b9-81c0-a93c-c3d65131f17e" // Jarvis To-Do

const DOMAIN_OPTIONS = [
  { name: "Strategy", color: "purple" },
  { name: "Clinical", color: "orange" },
  { name: "Research", color: "blue" },
  { name: "AI", color: "default" },
  { name: "Finance", color: "yellow" },
  { name: "Training", color: "brown" },
  { name: "Family", color: "green" },
  { name: "Personal", color: "pink" },
  { name: "Operations", color: "gray" },
]

interface NotionDb {
  id: string
  properties: Record<string, { id: string; type: string; name: string }>
}

async function createSessionLogDb(): Promise<NotionDb> {
  return notionRequest<NotionDb>("/databases", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "page_id", page_id: PARENT_PAGE_ID },
      title: [{ text: { content: "Dakota Session Log" } }],
      properties: {
        Name: { title: {} },
        Date: { date: {} },
        Channel: {
          select: {
            options: [
              { name: "telegram", color: "blue" },
              { name: "cli", color: "gray" },
              { name: "tui", color: "brown" },
              { name: "subagent", color: "purple" },
            ],
          },
        },
        Origin: {
          select: {
            options: [
              { name: "지시", color: "green" },
              { name: "논의", color: "blue" },
              { name: "수행", color: "gray" },
            ],
          },
        },
        Agent: {
          select: {
            options: [
              { name: "dakota", color: "blue" },
              { name: "elon", color: "orange" },
              { name: "brian", color: "green" },
              { name: "andrej", color: "purple" },
              { name: "warren", color: "yellow" },
              { name: "lo", color: "brown" },
            ],
          },
        },
        Domain: { select: { options: DOMAIN_OPTIONS } },
        Tags: { multi_select: { options: [] } },
        Summary: { rich_text: {} },
        Outcome: {
          select: {
            options: [
              { name: "완료", color: "green" },
              { name: "진행", color: "blue" },
              { name: "보류", color: "yellow" },
              { name: "단발조회", color: "gray" },
            ],
          },
        },
        "Msg Count": { number: { format: "number" } },
        "Session Key": { rich_text: {} },
      },
    }),
  })
}

async function extendOperations(sessionLogDbId: string): Promise<void> {
  if (!OPERATIONS_DB_ID) throw new Error("NOTION_DAKOTA_OPERATIONS_DB_ID 미설정")

  // (1) 단순 속성 + Domain 옵션 확장
  await notionRequest(`/databases/${OPERATIONS_DB_ID}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        Domain: { select: { options: DOMAIN_OPTIONS } },
        Tags: { multi_select: { options: [] } },
        "Started At": { date: {} },
        "Last Touched": { date: {} },
        "Session Count": { number: { format: "number" } },
        "Msg Total": { number: { format: "number" } },
      },
    }),
  })
  console.log("[2/4] Operations 단순 속성 추가 완료")

  // (2) Session Log -> Operations 양방향 relation.
  //     Notion이 Operations 쪽에 역방향 속성을 자동 생성한다.
  await notionRequest(`/databases/${sessionLogDbId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        Operation: {
          relation: {
            database_id: OPERATIONS_DB_ID,
            type: "dual_property",
            dual_property: {},
          },
        },
      },
    }),
  })
  console.log("[3/4] Operation relation 생성 완료")

  // (3) 자동 생성된 역방향 속성을 찾아 "Sessions"로 개명
  const ops = await notionRequest<NotionDb>(`/databases/${OPERATIONS_DB_ID}`, { method: "GET" })
  const reciprocal = Object.values(ops.properties).find(
    (p) => p.type === "relation" && p.name !== "Sessions"
  )
  if (reciprocal && reciprocal.name !== "Sessions") {
    await notionRequest(`/databases/${OPERATIONS_DB_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: { [reciprocal.name]: { name: "Sessions" } } }),
    })
    console.log(`[4/4] 역방향 relation "${reciprocal.name}" -> "Sessions" 개명 완료`)
  }

  // (4) formula 2종
  await notionRequest(`/databases/${OPERATIONS_DB_ID}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        "Days Stalled": {
          formula: { expression: 'dateBetween(now(), prop("Last Touched"), "days")' },
        },
        "Lead Time": {
          formula: { expression: 'dateBetween(prop("Completed At"), prop("Started At"), "days")' },
        },
      },
    }),
  })
  console.log("formula 2종 추가 완료")
}

async function main() {
  const existing = process.env.NOTION_DAKOTA_SESSION_LOG_DB_ID
  let dbId = existing
  if (dbId) {
    console.log(`[1/4] Session Log DB 이미 존재: ${dbId} (생성 건너뜀)`)
  } else {
    const db = await createSessionLogDb()
    dbId = db.id
    console.log(`[1/4] Session Log DB 생성됨: ${dbId}`)
  }
  await extendOperations(dbId!)
  console.log("")
  console.log("=== .env.local 에 아래 줄을 추가하세요 ===")
  console.log(`NOTION_DAKOTA_SESSION_LOG_DB_ID=${dbId}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 3: 스크립트 실행**

```bash
npx tsx --env-file=.env.local scripts/dakota-ledger-schema.ts
```

Expected: `[1/4]` ~ `[4/4]`와 `formula 2종 추가 완료`가 차례로 출력되고, 마지막에 `NOTION_DAKOTA_SESSION_LOG_DB_ID=<32자리 id>`가 나온다.

`Days Stalled` / `Lead Time`에서 400이 나면 Notion UI에서 해당 DB를 열어 수식 속성 2개를 직접 만든다 (수식은 위 `expression` 문자열 그대로). 나머지 단계는 이미 성공했으므로 재실행하지 않는다.

- [ ] **Step 4: `.env.local`에 ID 기입**

Step 3 출력의 마지막 줄을 `.env.local`에 붙여넣는다. `HERMES_STATE_DB`, `DAKOTA_LEDGER_MODEL`도 함께 추가한다.

```
NOTION_DAKOTA_SESSION_LOG_DB_ID=<Step 3 출력값>
HERMES_STATE_DB=/Users/TakMD/.hermes/state.db
DAKOTA_LEDGER_MODEL=claude-sonnet-5
```

- [ ] **Step 5: 스키마 검증**

```bash
npx tsx --env-file=.env.local -e '
import { notionRequest } from "./lib/notion/client"
const show = async (id: string, label: string) => {
  const db: any = await notionRequest(`/databases/${id}`, { method: "GET" })
  console.log(label, Object.values(db.properties).map((p: any) => `${p.name}:${p.type}`).sort().join("  "))
}
await show(process.env.NOTION_DAKOTA_SESSION_LOG_DB_ID!, "SESSION LOG >")
await show(process.env.NOTION_DAKOTA_OPERATIONS_DB_ID!, "OPERATIONS  >")
'
```

Expected:
- `SESSION LOG >` 줄에 `Agent:select Channel:select Date:date Domain:select Msg Count:number Name:title Operation:relation Origin:select Outcome:select Session Key:rich_text Summary:rich_text Tags:multi_select` 이 모두 보인다.
- `OPERATIONS  >` 줄에 `Days Stalled:formula Last Touched:date Lead Time:formula Msg Total:number Session Count:number Sessions:relation Started At:date Tags:multi_select` 이 모두 보인다.

- [ ] **Step 6: 커밋**

```bash
git add scripts/dakota-ledger-schema.ts
git commit -m "feat(ledger): Notion 스키마 구축 스크립트 — Session Log DB + Operations 확장"
```

---

### Task 2: state.db 리더

`state.db`에서 승격 대상 세션을 읽어 `RawSession[]`으로 만든다.

**Files:**
- Create: `lib/dakota-ledger/types.ts`
- Create: `lib/dakota-ledger/sessionSource.ts`
- Test: `lib/dakota-ledger/sessionSource.test.ts`

**Interfaces:**
- Consumes: `node:sqlite`의 `DatabaseSync`

> **주의:** 이 저장소에는 `@types/node@20`이 깔려 있어 `node:sqlite` 타입이 없고,
> 대신 손으로 쓴 shim `types/node-sqlite.d.ts`가 있다. 그런데 그 shim이
> `constructor(filename?: string)`만 선언해서 `{ readOnly: true }` 인자가 타입 에러가 난다.
> 런타임(Node 22.22.3)은 옵션을 정상 처리한다. **shim을 실제 API에 맞게 넓혀야 한다** —
> 안 하면 `next build`의 타입체크가 실패해 Vercel 배포가 깨진다.
- Produces:
  - `type LedgerOrigin = "지시" | "논의" | "수행"`
  - `type LedgerChannel = "telegram" | "cli" | "tui" | "subagent"`
  - `type LedgerDomain` (9개 리터럴 유니온)
  - `type LedgerAgent = "dakota" | "elon" | "brian" | "andrej" | "warren" | "lo"`
  - `type LedgerOutcome = "완료" | "진행" | "보류" | "단발조회"`
  - `interface RawSession { sessionKey: string; channel: LedgerChannel; startedAt: string; messageCount: number; firstUserMessage: string; lastAssistantMessage: string; toolNames: string[] }`
  - `readSessions(dbPath: string, sinceEpoch: number): RawSession[]`

- [ ] **Step 0: `node:sqlite` 타입 shim 넓히기**

`types/node-sqlite.d.ts`의 `DatabaseSync` 생성자를 Node 22의 실제 시그니처에 맞춘다.
두 번째 인자가 선택적이므로 기존 `new DatabaseSync(path)` 호출은 그대로 통과한다.

```typescript
  export class DatabaseSync {
    constructor(filename?: string, options?: { readOnly?: boolean; open?: boolean })
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
  }
```

확인: `npx tsc --noEmit`에 `sessionSource.ts` 관련 에러가 없어야 한다.

- [ ] **Step 1: 타입 파일 작성**

`lib/dakota-ledger/types.ts`:

```typescript
export type LedgerOrigin = "지시" | "논의" | "수행"

export type LedgerChannel = "telegram" | "cli" | "tui" | "subagent"

export type LedgerDomain =
  | "Strategy" | "Clinical" | "Research" | "AI" | "Finance"
  | "Training" | "Family" | "Personal" | "Operations"

export type LedgerAgent = "dakota" | "elon" | "brian" | "andrej" | "warren" | "lo"

export type LedgerOutcome = "완료" | "진행" | "보류" | "단발조회"

export const LEDGER_CHANNELS: LedgerChannel[] = ["telegram", "cli", "tui", "subagent"]

export const LEDGER_DOMAINS: LedgerDomain[] = [
  "Strategy", "Clinical", "Research", "AI", "Finance",
  "Training", "Family", "Personal", "Operations",
]

/** state.db에서 읽어낸 가공 전 세션 */
export interface RawSession {
  sessionKey: string
  channel: LedgerChannel
  /** ISO 8601 UTC */
  startedAt: string
  messageCount: number
  firstUserMessage: string
  lastAssistantMessage: string
  toolNames: string[]
}

/** Origin 판정이 끝난 세션 */
export interface ClassifiedSession extends RawSession {
  origin: LedgerOrigin
}

/** KST 날짜로 묶인 하루치 */
export interface DaySessions {
  /** YYYY-MM-DD (Asia/Seoul) */
  date: string
  sessions: ClassifiedSession[]
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`lib/dakota-ledger/sessionSource.test.ts`:

```typescript
import { describe, expect, it, beforeAll, afterAll } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { readSessions } from "./sessionSource"

let dir: string
let dbPath: string

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "ledger-"))
  dbPath = path.join(dir, "state.db")
  const db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, source TEXT NOT NULL, started_at REAL NOT NULL,
      message_count INTEGER DEFAULT 0
    );
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL,
      role TEXT NOT NULL, content TEXT, tool_name TEXT, timestamp REAL NOT NULL
    );
  `)
  // 1000 = 1970-01-01T00:16:40Z, 2000 = ...00:33:20Z
  db.exec(`
    INSERT INTO sessions VALUES
      ('s-tg',   'telegram', 2000, 5),
      ('s-cli',  'cli',      2000, 4),
      ('s-cron', 'cron',     2000, 9),
      ('s-thin', 'telegram', 2000, 2),
      ('s-old',  'telegram', 1000, 7);
    INSERT INTO messages (session_id, role, content, tool_name, timestamp) VALUES
      ('s-tg', 'user',      '첫 지시입니다',  NULL,       2001),
      ('s-tg', 'assistant', '중간 답변',      NULL,       2002),
      ('s-tg', 'tool',      NULL,             'web_search', 2003),
      ('s-tg', 'tool',      NULL,             'web_search', 2004),
      ('s-tg', 'assistant', '마지막 답변',    NULL,       2005),
      ('s-cli','user',      'cli 지시',       NULL,       2001),
      ('s-cli','assistant', 'cli 답변',       NULL,       2002),
      ('s-old','user',      '옛날 지시',      NULL,       1001);
  `)
  db.close()
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("readSessions", () => {
  it("cron source를 제외한다", () => {
    const keys = readSessions(dbPath, 0).map((s) => s.sessionKey)
    expect(keys).not.toContain("s-cron")
  })

  it("message_count가 3 미만인 세션을 제외한다", () => {
    const keys = readSessions(dbPath, 0).map((s) => s.sessionKey)
    expect(keys).not.toContain("s-thin")
  })

  it("sinceEpoch 이전 세션을 제외한다", () => {
    const keys = readSessions(dbPath, 1500).map((s) => s.sessionKey)
    expect(keys).not.toContain("s-old")
    expect(keys).toContain("s-tg")
  })

  it("첫 사용자 메시지와 마지막 assistant 메시지를 뽑는다", () => {
    const tg = readSessions(dbPath, 0).find((s) => s.sessionKey === "s-tg")!
    expect(tg.firstUserMessage).toBe("첫 지시입니다")
    expect(tg.lastAssistantMessage).toBe("마지막 답변")
  })

  it("툴 이름을 중복 없이 모은다", () => {
    const tg = readSessions(dbPath, 0).find((s) => s.sessionKey === "s-tg")!
    expect(tg.toolNames).toEqual(["web_search"])
  })

  it("startedAt을 ISO 문자열로 변환한다", () => {
    const tg = readSessions(dbPath, 0).find((s) => s.sessionKey === "s-tg")!
    expect(tg.startedAt).toBe(new Date(2000 * 1000).toISOString())
  })

  it("결과를 시작 시각 오름차순으로 정렬한다", () => {
    const all = readSessions(dbPath, 0)
    const times = all.map((s) => s.startedAt)
    expect([...times].sort()).toEqual(times)
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

```bash
npm run test -- lib/dakota-ledger/sessionSource.test.ts
```

Expected: FAIL — `Failed to resolve import "./sessionSource"`

- [ ] **Step 4: 구현**

`lib/dakota-ledger/sessionSource.ts`:

```typescript
import { DatabaseSync } from "node:sqlite"
import { LEDGER_CHANNELS, type LedgerChannel, type RawSession } from "./types"

interface Row {
  id: string
  source: string
  started_at: number
  message_count: number
  first_user: string | null
  last_assistant: string | null
  tool_names: string | null
}

const QUERY = `
  SELECT
    s.id, s.source, s.started_at, s.message_count,
    (SELECT m.content FROM messages m
      WHERE m.session_id = s.id AND m.role = 'user' AND m.content IS NOT NULL
      ORDER BY m.timestamp ASC LIMIT 1) AS first_user,
    (SELECT m.content FROM messages m
      WHERE m.session_id = s.id AND m.role = 'assistant' AND m.content IS NOT NULL
      ORDER BY m.timestamp DESC LIMIT 1) AS last_assistant,
    (SELECT group_concat(DISTINCT m.tool_name) FROM messages m
      WHERE m.session_id = s.id AND m.tool_name IS NOT NULL) AS tool_names
  FROM sessions s
  WHERE s.source IN ('telegram','cli','tui','subagent')
    AND s.message_count >= 3
    AND s.started_at >= ?
  ORDER BY s.started_at ASC
`

/**
 * state.db를 읽기 전용으로 열어 승격 대상 세션을 뽑는다.
 * cron source와 message_count < 3 세션은 SQL 단계에서 걸러진다.
 */
export function readSessions(dbPath: string, sinceEpoch: number): RawSession[] {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const rows = db.prepare(QUERY).all(sinceEpoch) as unknown as Row[]
    return rows.map((r) => ({
      sessionKey: r.id,
      channel: r.source as LedgerChannel,
      startedAt: new Date(r.started_at * 1000).toISOString(),
      messageCount: r.message_count,
      firstUserMessage: (r.first_user ?? "").trim(),
      lastAssistantMessage: (r.last_assistant ?? "").trim(),
      toolNames: (r.tool_names ?? "").split(",").filter(Boolean),
    })).filter((s) => LEDGER_CHANNELS.includes(s.channel))
  } finally {
    db.close()
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npm run test -- lib/dakota-ledger/sessionSource.test.ts
```

Expected: PASS — 7 passed

- [ ] **Step 6: 실제 state.db로 스모크 확인**

```bash
npx tsx -e '
import { readSessions } from "./lib/dakota-ledger/sessionSource"
const all = readSessions(process.env.HOME + "/.hermes/state.db", 0)
console.log("세션 수:", all.length)
const byCh: Record<string, number> = {}
for (const s of all) byCh[s.channel] = (byCh[s.channel] ?? 0) + 1
console.log("채널별:", byCh)
'
```

Expected: `세션 수: 196`, `채널별: { telegram: 147, cli: 29, tui: 4, subagent: 16 }`

숫자가 다르면 그 시점까지 세션이 더 쌓인 것이므로 196 이상이면 정상이다. `cron` 키가 나오면 버그다.

- [ ] **Step 7: 커밋**

```bash
git add lib/dakota-ledger/types.ts lib/dakota-ledger/sessionSource.ts lib/dakota-ledger/sessionSource.test.ts
git commit -m "feat(ledger): state.db 읽기 전용 세션 리더"
```

---

### Task 3: Origin 분류 · 날짜 그룹핑 · 컨텍스트 절삭

승격 전 순수 변환 계층. 외부 의존이 없어 전부 단위 테스트한다.

**Files:**
- Create: `lib/dakota-ledger/classify.ts`
- Test: `lib/dakota-ledger/classify.test.ts`

**Interfaces:**
- Consumes: `RawSession` · `ClassifiedSession` · `DaySessions` from `./types`
- Produces:
  - `classifyOrigin(session: RawSession): LedgerOrigin`
  - `classifySessions(sessions: RawSession[]): ClassifiedSession[]`
  - `toSeoulDate(iso: string): string` — `YYYY-MM-DD`
  - `groupByDay(sessions: ClassifiedSession[]): DaySessions[]`
  - `truncateSession(session: ClassifiedSession, limit?: number): string`
  - `buildDayContext(day: DaySessions, detailLimit?: number): string`

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/dakota-ledger/classify.test.ts`:

```typescript
import { describe, expect, it } from "vitest"
import {
  buildDayContext, classifyOrigin, classifySessions,
  groupByDay, toSeoulDate, truncateSession,
} from "./classify"
import type { ClassifiedSession, RawSession } from "./types"

function raw(over: Partial<RawSession> = {}): RawSession {
  return {
    sessionKey: "k", channel: "telegram", startedAt: "2026-07-20T04:00:00.000Z",
    messageCount: 5, firstUserMessage: "정리 좀 해줘", lastAssistantMessage: "네",
    toolNames: [], ...over,
  }
}

describe("classifyOrigin", () => {
  it("subagent 채널은 항상 수행", () => {
    expect(classifyOrigin(raw({ channel: "subagent", firstUserMessage: "안녕" }))).toBe("수행")
  })

  it("영어 명령형으로 시작하면 수행", () => {
    expect(classifyOrigin(raw({ firstUserMessage: "Analyze /tmp/kakao.json and report" }))).toBe("수행")
    expect(classifyOrigin(raw({ firstUserMessage: "Produce a detailed Korean briefing" }))).toBe("수행")
  })

  it("페르소나 지정 프롬프트는 수행", () => {
    expect(classifyOrigin(raw({ firstUserMessage: "You are Andrej, AI specialist." }))).toBe("수행")
    expect(classifyOrigin(raw({ firstUserMessage: "Brian으로서 이번 주 논문을 정리해" }))).toBe("수행")
    expect(classifyOrigin(raw({ firstUserMessage: "As Warren, give a cold view on SpaceX IPO" }))).toBe("수행")
  })

  it("일상 한국어 '~로서'는 수행이 아니다", () => {
    // 오탐 시 센터장님의 실제 지시가 칸반에서 사라진다
    expect(classifyOrigin(raw({ firstUserMessage: "의사로서 이 환자는 수술이 필요해 보이는데 어떻게 생각해?" }))).toBe("지시")
    expect(classifyOrigin(raw({ firstUserMessage: "부모로서 걱정되는 부분이 있어" }))).toBe("지시")
  })

  it("cron 산출물이 텔레그램으로 유입된 것은 수행", () => {
    expect(classifyOrigin(raw({ firstUserMessage: "Cronjob Response: ExoBrain wiki sync ---" }))).toBe("수행")
  })

  // 실제 state.db에서 '지시'로 오분류됐던 문구들 (2026-07-27 실측).
  // 실제 본문은 193~674자다. 길이 게이트를 지나야 하므로 발췌가 아니라
  // 실측 길이대에 맞춘 전문을 쓴다.
  it.each([
    "Audit the current ExoBrain LLM Wiki sync implementation for correctness. " +
      "Report the exact input delta and the outputs created, and confirm the legacy " +
      "compiler was not invoked at any point during the run.",
    "Write the final standalone report for 에르메스단. Start exactly with the header " +
      "and cover the last 24 hours only. Exclude 잡담, 레퍼럴, 모집, and repeated model praise. " +
      "Keep every claim traceable to a message in the transcript.",
    "Design a concrete capability and approval policy for six agents. Identify which " +
      "actions each agent may take unattended, which require approval, and which are " +
      "forbidden outright. Justify each boundary in one sentence.",
    "Create a concise high-signal AI/social update brief in Korean from the collected " +
      "transcripts. Drop anything promotional or repetitive, and keep at most two items " +
      "per source so the brief stays readable in a single screen.",
  ])("실측 오분류 회귀: %s", (text) => {
    expect(text.length).toBeGreaterThanOrEqual(120)
    expect(classifyOrigin(raw({ firstUserMessage: text }))).toBe("수행")
  })

  // 실제 센터장님 발화. 보강한 동사 목록에 걸리면 안 된다.
  it.each([
    ["My experience of the Aside was amazing… Thanks for developing this", 5],
    ["hermes gaitway start", 8],
    ["chatGPT 서버 터지면서 뻑났었ㄷ는듯?", 8],
  ])("사용자 발화는 지시로 남는다: %s", (text, count) => {
    expect(classifyOrigin(raw({ firstUserMessage: text, messageCount: count as number }))).toBe("지시")
  })

  // 일상 영어 동사로 시작하는 짧은 지시. 길이 게이트가 없으면 수행으로 삼켜진다.
  // 강등은 단방향(지시->수행)이라 과탐은 되돌릴 수 없다.
  it.each([
    "Create a to-do for tomorrow OR list",
    "Design a workout split for this week",
    "Write this down: call the hospital at 3pm",
    "Audit my expenses for July",
    "Act as devil advocate on this plan",
    "Find my Jeju rental car booking",
    "Review my schedule for Friday",
  ])("짧은 일상 영어 지시는 지시로 남는다: %s", (text) => {
    expect(classifyOrigin(raw({ firstUserMessage: text }))).toBe("지시")
  })

  it("같은 동사라도 충분히 길면 디스패치로 본다", () => {
    // 실측 디스패치는 최소 193자
    const long = "Audit the current ExoBrain LLM Wiki sync implementation for correctness, " +
      "then report the exact input delta and the outputs created. Do not run the legacy " +
      "compiler and do not write to the legacy directory under any circumstance."
    expect(long.length).toBeGreaterThanOrEqual(120)
    expect(classifyOrigin(raw({ firstUserMessage: long }))).toBe("수행")
  })

  it("파일 경로가 섞이면 수행", () => {
    expect(classifyOrigin(raw({ firstUserMessage: "이거 /tmp/dump.json 봐줘" }))).toBe("수행")
  })

  it("한글 장문 대화는 논의", () => {
    expect(classifyOrigin(raw({ firstUserMessage: "알리바바 플랜 정리 좀", messageCount: 239 }))).toBe("논의")
  })

  it("한글 단문은 지시", () => {
    expect(classifyOrigin(raw({ firstUserMessage: "렌트카 빌리는거 진행해", messageCount: 8 }))).toBe("지시")
  })

  it("cli 짧은 질문도 지시", () => {
    expect(classifyOrigin(raw({ channel: "cli", firstUserMessage: "hermes gaitway start", messageCount: 8 }))).toBe("지시")
  })
})

describe("toSeoulDate", () => {
  it("UTC를 KST 날짜로 변환한다", () => {
    expect(toSeoulDate("2026-07-20T04:00:00.000Z")).toBe("2026-07-20")
  })

  it("UTC 늦은 밤은 KST 다음 날이 된다", () => {
    expect(toSeoulDate("2026-07-20T16:00:00.000Z")).toBe("2026-07-21")
  })
})

describe("groupByDay", () => {
  it("KST 날짜로 묶고 날짜 오름차순으로 반환한다", () => {
    const sessions = classifySessions([
      raw({ sessionKey: "a", startedAt: "2026-07-20T16:00:00.000Z" }),
      raw({ sessionKey: "b", startedAt: "2026-07-20T04:00:00.000Z" }),
      raw({ sessionKey: "c", startedAt: "2026-07-20T05:00:00.000Z" }),
    ])
    const days = groupByDay(sessions)
    expect(days.map((d) => d.date)).toEqual(["2026-07-20", "2026-07-21"])
    expect(days[0].sessions.map((s) => s.sessionKey)).toEqual(["b", "c"])
    expect(days[1].sessions.map((s) => s.sessionKey)).toEqual(["a"])
  })
})

describe("truncateSession", () => {
  it("상한을 넘지 않는다", () => {
    const s: ClassifiedSession = { ...raw({ firstUserMessage: "가".repeat(5000) }), origin: "지시" }
    expect(truncateSession(s, 2000).length).toBeLessThanOrEqual(2000)
  })

  it("세션 키·채널·Origin·툴 이름을 담는다", () => {
    const s: ClassifiedSession = { ...raw({ sessionKey: "s-1", toolNames: ["web_search"] }), origin: "지시" }
    const out = truncateSession(s)
    expect(out).toContain("s-1")
    expect(out).toContain("telegram")
    expect(out).toContain("지시")
    expect(out).toContain("web_search")
  })
})

describe("buildDayContext", () => {
  it("세션이 상한을 넘으면 Msg Count 상위만 상세로 담는다", () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      ({ ...raw({ sessionKey: `s${i}`, messageCount: i, firstUserMessage: `본문${i}` }), origin: "지시" as const })
    )
    const out = buildDayContext({ date: "2026-07-18", sessions: many }, 10)
    // 가장 큰 s14는 상세(본문 포함), 가장 작은 s0은 제목만
    expect(out).toContain("본문14")
    expect(out).toContain("s0")
    expect(out).not.toContain("본문0")
  })

  it("날짜를 머리말에 넣는다", () => {
    const one = [{ ...raw(), origin: "지시" as const }]
    expect(buildDayContext({ date: "2026-07-18", sessions: one })).toContain("2026-07-18")
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npm run test -- lib/dakota-ledger/classify.test.ts
```

Expected: FAIL — `Failed to resolve import "./classify"`

- [ ] **Step 3: 구현**

`lib/dakota-ledger/classify.ts`:

```typescript
import type { ClassifiedSession, DaySessions, LedgerOrigin, RawSession } from "./types"

/**
 * 디스패치에서만 쓰이는 동사. 길이와 무관하게 수행으로 본다.
 */
const DISPATCH_VERB_STRONG =
  /^\s*(you are |analyze |deep-digest |summarize |produce |retrieve |research |inspect |use the |collect |compare |draft |generate )/i

/**
 * 일상 영어로도 쓰이는 동사. 이것만으로 수행 판정하면
 * "Audit my expenses for July" 같은 실제 지시를 삼켜버린다.
 *
 * 강등은 LLM이 지시→수행 단방향으로만 가능하므로, 과탐은 되돌릴 길이 없고
 * 미탐은 LLM이 건진다. 따라서 휴리스틱은 보수적이어야 한다.
 *
 * 실측(2026-07-27, 196세션): 이 동사로 시작하는 실제 디스패치는 최소 193자,
 * 일상 지시로 상정되는 문장은 50자 미만. 120자를 경계로 둔다.
 */
const DISPATCH_VERB_GENERIC = /^\s*(act as |audit |create |design |write |find |review )/i

const GENERIC_VERB_MIN_LENGTH = 120

/** "As Warren, ..." 형태의 영문 페르소나 지정. 대소문자를 구분해야 오탐이 없다. */
const PERSONA_EN = /^\s*As [A-Z][a-z]+,/

/**
 * "Brian으로서" 처럼 영문 이름 뒤에 붙은 경우만 페르소나 지정으로 본다.
 * "의사로서", "부모로서" 같은 일상 한국어 조사까지 잡으면
 * 센터장님의 실제 지시가 수행으로 오분류돼 칸반에서 사라진다.
 */
const PERSONA_KO = /[A-Z][a-zA-Z]*(으로서|로서)\s/

/** cron 산출물이 텔레그램 세션으로 유입된 것. 장부 대상이 아니다. */
const CRON_RELAY = /^\s*Cronjob Response:/i

/** 논의로 볼 최소 메시지 수 */
const DISCUSSION_MIN_MESSAGES = 30

const HANGUL = /[가-힣]/

export function classifyOrigin(session: RawSession): LedgerOrigin {
  if (session.channel === "subagent") return "수행"

  const text = session.firstUserMessage
  const head = text.slice(0, 40)
  if (
    DISPATCH_VERB_STRONG.test(text) ||
    (DISPATCH_VERB_GENERIC.test(text) && text.length >= GENERIC_VERB_MIN_LENGTH) ||
    PERSONA_EN.test(text) ||
    CRON_RELAY.test(text) ||
    text.includes("/tmp/") ||
    PERSONA_KO.test(head)
  ) {
    return "수행"
  }

  if (session.messageCount >= DISCUSSION_MIN_MESSAGES && HANGUL.test(session.firstUserMessage)) {
    return "논의"
  }

  return "지시"
}

export function classifySessions(sessions: RawSession[]): ClassifiedSession[] {
  return sessions.map((s) => ({ ...s, origin: classifyOrigin(s) }))
}

/** ISO 문자열을 Asia/Seoul 기준 YYYY-MM-DD로 변환한다. */
export function toSeoulDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso))
}

export function groupByDay(sessions: ClassifiedSession[]): DaySessions[] {
  const buckets = new Map<string, ClassifiedSession[]>()
  for (const s of sessions) {
    const date = toSeoulDate(s.startedAt)
    const list = buckets.get(date)
    if (list) list.push(s)
    else buckets.set(date, [s])
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({
      date,
      sessions: list.slice().sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    }))
}

const DEFAULT_SESSION_LIMIT = 2000
const DEFAULT_DETAIL_LIMIT = 10

/** 세션 하나를 LLM 입력용 블록으로 압축한다. */
export function truncateSession(
  session: ClassifiedSession,
  limit: number = DEFAULT_SESSION_LIMIT
): string {
  const header =
    `[${session.sessionKey}] ${session.startedAt} · ${session.channel} · ${session.origin} · ` +
    `${session.messageCount}msg · tools=${session.toolNames.join(",") || "none"}`
  const body =
    `요청: ${session.firstUserMessage}\n` +
    `응답: ${session.lastAssistantMessage}`
  const room = limit - header.length - 1
  return room <= 0 ? header.slice(0, limit) : `${header}\n${body.slice(0, room)}`
}

/**
 * 하루치를 LLM 입력 문자열로 만든다.
 * 세션이 detailLimit을 넘으면 Msg Count 상위만 본문을 담고 나머지는 머리말만 담는다.
 */
export function buildDayContext(
  day: DaySessions,
  detailLimit: number = DEFAULT_DETAIL_LIMIT
): string {
  const ranked = day.sessions.slice().sort((a, b) => b.messageCount - a.messageCount)
  const detailed = new Set(ranked.slice(0, detailLimit).map((s) => s.sessionKey))

  const blocks = day.sessions.map((s) =>
    detailed.has(s.sessionKey)
      ? truncateSession(s)
      : `[${s.sessionKey}] ${s.startedAt} · ${s.channel} · ${s.origin} · ${s.messageCount}msg (본문 생략)`
  )

  return `날짜: ${day.date} (Asia/Seoul), 세션 ${day.sessions.length}건\n\n${blocks.join("\n\n")}`
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm run test -- lib/dakota-ledger/classify.test.ts
```

Expected: PASS — 31 passed

- [ ] **Step 5: 실제 데이터로 Origin 분포 확인**

```bash
npx tsx -e '
import { readSessions } from "./lib/dakota-ledger/sessionSource"
import { classifySessions, groupByDay } from "./lib/dakota-ledger/classify"
const s = classifySessions(readSessions(process.env.HOME + "/.hermes/state.db", 0))
const c: Record<string, number> = {}
for (const x of s) c[x.origin] = (c[x.origin] ?? 0) + 1
console.log("Origin:", c)
console.log("활동일:", groupByDay(s).length)
'
```

Expected: 세 Origin 키가 모두 존재하고 합이 세션 수와 같다. 활동일 48일 내외.

휴리스틱 보강 전 실측은 `{ 지시: 64, 논의: 84, 수행: 48 }`였으나, 그 `지시` 64건에 디스패치 19건이 섞여 있었다.
보강 후에는 `수행`이 60건대로 늘고 `지시`가 그만큼 줄어야 정상이다. `수행`이 48에서 늘지 않았다면 보강이 먹지 않은 것이다.

- [ ] **Step 6: 커밋**

```bash
git add lib/dakota-ledger/classify.ts lib/dakota-ledger/classify.test.ts
git commit -m "feat(ledger): Origin 분류 · KST 날짜 그룹핑 · 컨텍스트 절삭"
```

---

### Task 4: Session Log Notion 어댑터

**Files:**
- Create: `lib/notion/sessionLog.ts`
- Test: `lib/notion/sessionLog.test.ts`

**Interfaces:**
- Consumes: `notionRequest` from `./client`; 타입은 `@/lib/dakota-ledger/types`
- Produces:
  - `interface SessionLogInput { name: string; date: string; channel: LedgerChannel; origin: LedgerOrigin; agent: LedgerAgent; domain: LedgerDomain; tags: string[]; summary: string; outcome: LedgerOutcome; msgCount: number; sessionKey: string; operationPageId: string | null }`
  - `getSessionLogDbId(): string | null`
  - `listExistingSessionKeys(): Promise<Set<string>>`
  - `createSessionLog(input: SessionLogInput): Promise<string>` — 생성된 page_id 반환

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/notion/sessionLog.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createSessionLog, listExistingSessionKeys } from "./sessionLog"
import type { SessionLogInput } from "./sessionLog"

const OLD_ENV = { ...process.env }

function mockFetchOnce(payload: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  })
}

beforeEach(() => {
  process.env.NOTION_TOKEN = "test-token"
  process.env.NOTION_DAKOTA_SESSION_LOG_DB_ID = "db-1"
})

afterEach(() => {
  process.env = { ...OLD_ENV }
  vi.unstubAllGlobals()
})

describe("listExistingSessionKeys", () => {
  it("페이지네이션을 따라가며 Session Key를 모은다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ properties: { "Session Key": { type: "rich_text", rich_text: [{ plain_text: "s-1" }] } } }],
          has_more: true,
          next_cursor: "cur-1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ properties: { "Session Key": { type: "rich_text", rich_text: [{ plain_text: "s-2" }] } } }],
          has_more: false,
          next_cursor: null,
        }),
      })
    vi.stubGlobal("fetch", fetchMock)

    const keys = await listExistingSessionKeys()
    expect(keys).toEqual(new Set(["s-1", "s-2"]))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // 커서를 실제로 넘겼는지까지 봐야 한다. 호출 횟수만 세면
    // next_cursor를 무시하고 같은 질의를 두 번 보내도 통과한다.
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).start_cursor).toBeUndefined()
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).start_cursor).toBe("cur-1")
  })

  it("DB 미설정이면 빈 집합을 준다", async () => {
    delete process.env.NOTION_DAKOTA_SESSION_LOG_DB_ID
    const keys = await listExistingSessionKeys()
    expect(keys.size).toBe(0)
  })
})

describe("createSessionLog", () => {
  const input: SessionLogInput = {
    name: "제주 렌터카 확정", date: "2026-07-15T13:41:00.000Z",
    channel: "tui", origin: "지시", agent: "dakota", domain: "Family",
    tags: ["여행"], summary: "제주패스 로그인 후 렌터카 예약 진행",
    outcome: "완료", msgCount: 80, sessionKey: "s-42",
    operationPageId: "op-1",
  }

  it("page_id를 반환한다", async () => {
    vi.stubGlobal("fetch", mockFetchOnce({ id: "page-9" }))
    await expect(createSessionLog(input)).resolves.toBe("page-9")
  })

  it("모든 속성을 Notion 형식으로 보낸다", async () => {
    const fetchMock = mockFetchOnce({ id: "page-9" })
    vi.stubGlobal("fetch", fetchMock)
    await createSessionLog(input)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.parent).toEqual({ database_id: "db-1" })
    expect(body.properties.Name.title[0].text.content).toBe("제주 렌터카 확정")
    expect(body.properties.Date.date.start).toBe("2026-07-15T13:41:00.000Z")
    expect(body.properties.Channel.select.name).toBe("tui")
    expect(body.properties.Origin.select.name).toBe("지시")
    expect(body.properties.Agent.select.name).toBe("dakota")
    expect(body.properties.Domain.select.name).toBe("Family")
    expect(body.properties.Summary.rich_text[0].text.content).toBe("제주패스 로그인 후 렌터카 예약 진행")
    expect(body.properties.Outcome.select.name).toBe("완료")
    expect(body.properties.Tags.multi_select).toEqual([{ name: "여행" }])
    expect(body.properties["Msg Count"].number).toBe(80)
    expect(body.properties["Session Key"].rich_text[0].text.content).toBe("s-42")
    expect(body.properties.Operation.relation).toEqual([{ id: "op-1" }])
  })

  it("operationPageId가 없으면 relation을 빈 배열로 보낸다", async () => {
    const fetchMock = mockFetchOnce({ id: "page-9" })
    vi.stubGlobal("fetch", fetchMock)
    await createSessionLog({ ...input, operationPageId: null })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.properties.Operation.relation).toEqual([])
  })

  it("DB 미설정이면 던진다", async () => {
    delete process.env.NOTION_DAKOTA_SESSION_LOG_DB_ID
    await expect(createSessionLog(input)).rejects.toThrow("NOTION_DAKOTA_SESSION_LOG_DB_ID")
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npm run test -- lib/notion/sessionLog.test.ts
```

Expected: FAIL — `Failed to resolve import "./sessionLog"`

- [ ] **Step 3: 구현**

`lib/notion/sessionLog.ts`:

```typescript
import { notionRequest } from "./client"
import type {
  LedgerAgent, LedgerChannel, LedgerDomain, LedgerOrigin, LedgerOutcome,
} from "@/lib/dakota-ledger/types"

const SESSION_LOG_DB_ID_KEY = "NOTION_DAKOTA_SESSION_LOG_DB_ID"

export interface SessionLogInput {
  name: string
  /** ISO 8601 */
  date: string
  channel: LedgerChannel
  origin: LedgerOrigin
  agent: LedgerAgent
  domain: LedgerDomain
  tags: string[]
  summary: string
  outcome: LedgerOutcome
  msgCount: number
  sessionKey: string
  operationPageId: string | null
}

interface QueryResponse {
  results: Array<{ properties: Record<string, { type: string; rich_text?: Array<{ plain_text?: string }> }> }>
  has_more: boolean
  next_cursor: string | null
}

export function getSessionLogDbId(): string | null {
  return process.env[SESSION_LOG_DB_ID_KEY] ?? null
}

function richText(content: string): Array<{ text: { content: string } }> {
  const safe = content.trim().slice(0, 1800)
  return safe ? [{ text: { content: safe } }] : []
}

/** 이미 적재된 Session Key 전체. 중복 적재 방지용. */
export async function listExistingSessionKeys(): Promise<Set<string>> {
  const dbId = getSessionLogDbId()
  const keys = new Set<string>()
  if (!dbId) return keys

  let cursor: string | null = null
  do {
    const res: QueryResponse = await notionRequest<QueryResponse>(`/databases/${dbId}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    })
    for (const page of res.results) {
      const value = (page.properties["Session Key"]?.rich_text ?? [])
        .map((t) => t.plain_text ?? "").join("").trim()
      if (value) keys.add(value)
    }
    cursor = res.has_more ? res.next_cursor : null
  } while (cursor)

  return keys
}

export async function createSessionLog(input: SessionLogInput): Promise<string> {
  const dbId = getSessionLogDbId()
  if (!dbId) throw new Error(`${SESSION_LOG_DB_ID_KEY} is not configured`)

  const res = await notionRequest<{ id: string }>("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: {
        Name: { title: richText(input.name) },
        Date: { date: { start: input.date } },
        Channel: { select: { name: input.channel } },
        Origin: { select: { name: input.origin } },
        Agent: { select: { name: input.agent } },
        Domain: { select: { name: input.domain } },
        Tags: { multi_select: input.tags.map((name) => ({ name })) },
        Summary: { rich_text: richText(input.summary) },
        Outcome: { select: { name: input.outcome } },
        "Msg Count": { number: input.msgCount },
        "Session Key": { rich_text: richText(input.sessionKey) },
        Operation: { relation: input.operationPageId ? [{ id: input.operationPageId }] : [] },
      },
    }),
  })

  return res.id
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm run test -- lib/notion/sessionLog.test.ts
```

Expected: PASS — 6 passed

- [ ] **Step 5: 커밋**

```bash
git add lib/notion/sessionLog.ts lib/notion/sessionLog.test.ts
git commit -m "feat(ledger): Session Log Notion 어댑터"
```

---

### Task 5: Operations 확장 매핑

기존 `lib/notion/operations.ts`에 Domain 2종과 신규 속성을 반영한다. 기존 export 시그니처는 깨지 않는다.

**Files:**
- Modify: `lib/notion/operations.ts`
- Test: `lib/notion/operations.test.ts`

**Interfaces:**
- Consumes: 기존 `OperationItem` · `CreateOperationInput` · `UpdateOperationInput`
- Produces:
  - `OPERATION_DOMAINS`에 `Finance` · `Training` 추가 (총 9개)
  - `OperationItem`에 `tags: string[]` · `started_at: string | null` · `last_touched: string | null` · `session_count: number` · `msg_total: number` 추가
  - `CreateOperationInput` / `UpdateOperationInput`에 `tags?: string[]` · `started_at?: string | null` · `last_touched?: string | null` · `session_count?: number` · `msg_total?: number` 추가

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/notion/operations.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OPERATION_DOMAINS, createOperation, getOperations, updateOperation } from "./operations"

const OLD_ENV = { ...process.env }

beforeEach(() => {
  process.env.NOTION_TOKEN = "test-token"
  process.env.NOTION_DAKOTA_OPERATIONS_DB_ID = "ops-db"
})

afterEach(() => {
  process.env = { ...OLD_ENV }
  vi.unstubAllGlobals()
})

const PAGE = {
  id: "op-1",
  url: "https://notion.so/op-1",
  created_time: "2026-07-01T00:00:00.000Z",
  last_edited_time: "2026-07-20T00:00:00.000Z",
  properties: {
    Name: { type: "title", title: [{ plain_text: "KSOR governance" }] },
    Status: { type: "select", select: { name: "In Progress" } },
    Type: { type: "select", select: { name: "Decision" } },
    Domain: { type: "select", select: { name: "Research" } },
    Priority: { type: "select", select: { name: "High" } },
    Tags: { type: "multi_select", multi_select: [{ name: "AI" }, { name: "Governance" }] },
    "Started At": { type: "date", date: { start: "2026-07-01" } },
    "Last Touched": { type: "date", date: { start: "2026-07-20" } },
    "Session Count": { type: "number", number: 5 },
    "Msg Total": { type: "number", number: 312 },
    Context: { type: "rich_text", rich_text: [] },
    "Action Taken": { type: "rich_text", rich_text: [] },
    Result: { type: "rich_text", rich_text: [] },
    "Next Action": { type: "rich_text", rich_text: [] },
  },
}

describe("OPERATION_DOMAINS", () => {
  it("Finance와 Training을 포함해 9개다", () => {
    expect(OPERATION_DOMAINS).toHaveLength(9)
    expect(OPERATION_DOMAINS).toContain("Finance")
    expect(OPERATION_DOMAINS).toContain("Training")
  })
})

describe("getOperations", () => {
  it("확장 속성을 매핑한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ results: [PAGE] }),
    }))
    const [item] = await getOperations()
    expect(item.tags).toEqual(["AI", "Governance"])
    expect(item.started_at).toBe("2026-07-01")
    expect(item.last_touched).toBe("2026-07-20")
    expect(item.session_count).toBe(5)
    expect(item.msg_total).toBe(312)
  })

  it("확장 속성이 비어 있어도 기본값으로 떨어진다", async () => {
    // 라이브 DB에는 아직 이 5개 속성이 없다. 다섯 개 전부 폴백을 확인한다.
    const bare = { ...PAGE, properties: { ...PAGE.properties } }
    for (const key of ["Tags", "Started At", "Last Touched", "Session Count", "Msg Total"]) {
      delete (bare.properties as Record<string, unknown>)[key]
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ results: [bare] }),
    }))
    const [item] = await getOperations()
    expect(item.tags).toEqual([])
    expect(item.started_at).toBeNull()
    expect(item.last_touched).toBeNull()
    expect(item.session_count).toBe(0)
    expect(item.msg_total).toBe(0)
  })
})

describe("createOperation", () => {
  it("Finance 도메인과 태그를 전송한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => PAGE })
    vi.stubGlobal("fetch", fetchMock)
    await createOperation({
      name: "비트코인 CLARITY Act 점검",
      domain: "Finance",
      tags: ["규제", "BTC"],
      started_at: "2026-07-18",
    })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.properties.Domain.select.name).toBe("Finance")
    expect(body.properties.Tags.multi_select).toEqual([{ name: "규제" }, { name: "BTC" }])
    expect(body.properties["Started At"].date).toEqual({ start: "2026-07-18" })
  })
})

describe("updateOperation", () => {
  it("Last Touched와 집계 수치를 갱신한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal("fetch", fetchMock)
    await updateOperation("op-1", { last_touched: "2026-07-27", session_count: 7, msg_total: 400 })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.properties["Last Touched"].date).toEqual({ start: "2026-07-27" })
    expect(body.properties["Session Count"].number).toBe(7)
    expect(body.properties["Msg Total"].number).toBe(400)
  })

  it("변경 항목이 없으면 요청하지 않는다", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    await updateOperation("op-1", {})
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npm run test -- lib/notion/operations.test.ts
```

Expected: FAIL — `OPERATION_DOMAINS` 길이가 7이라 첫 테스트부터 실패

- [ ] **Step 3: `operations.ts` 수정**

`lib/notion/operations.ts`에서 아래 4곳을 고친다.

(1) 도메인 상수 — `OPERATION_DOMAINS` 줄을 교체:

```typescript
export const OPERATION_DOMAINS = [
  "Strategy", "Clinical", "Research", "AI", "Finance",
  "Training", "Family", "Personal", "Operations",
] as const
```

(2) `NotionProperty` 인터페이스에 두 줄 추가:

```typescript
interface NotionProperty {
  type: string
  title?: NotionRichText[]
  rich_text?: NotionRichText[]
  select?: { name: string } | null
  multi_select?: Array<{ name: string }>
  number?: number | null
  date?: { start: string; end: string | null } | null
  url?: string | null
}
```

(3) `OperationItem` / `CreateOperationInput` / `UpdateOperationInput` 확장:

```typescript
export interface OperationItem {
  page_id: string
  name: string
  status: OperationStatus
  type: OperationType
  domain: OperationDomain
  priority: string
  tags: string[]
  context: string
  action_taken: string
  result: string
  next_action: string
  linked_todo_url: string | null
  source_url: string | null
  started_at: string | null
  last_touched: string | null
  session_count: number
  msg_total: number
  created_at: string
  updated_at: string
  completed_at: string | null
  notion_url: string
}

export interface CreateOperationInput {
  name: string
  status?: OperationStatus
  type?: OperationType
  domain?: OperationDomain
  priority?: string
  tags?: string[]
  context?: string
  action_taken?: string
  result?: string
  next_action?: string
  linked_todo_url?: string | null
  source_url?: string | null
  started_at?: string | null
  last_touched?: string | null
  session_count?: number
  msg_total?: number
}

export interface UpdateOperationInput extends Omit<CreateOperationInput, "name"> {
  name?: string
  completed_at?: string | null
}
```

(4) `toOperation()`의 반환 객체에 5줄 추가 (`priority` 다음 줄에 `tags`, `source_url` 다음에 나머지):

```typescript
    priority: p.Priority?.select?.name ?? "Medium",
    tags: (p.Tags?.multi_select ?? []).map((t) => t.name),
    context: text(p.Context),
    action_taken: text(p["Action Taken"]),
    result: text(p.Result),
    next_action: text(p["Next Action"]),
    linked_todo_url: p["Linked Todo"]?.url ?? null,
    source_url: p.Source?.url ?? null,
    started_at: p["Started At"]?.date?.start ?? null,
    last_touched: p["Last Touched"]?.date?.start ?? null,
    session_count: p["Session Count"]?.number ?? 0,
    msg_total: p["Msg Total"]?.number ?? 0,
```

(5) `createOperation()`의 `properties`에 4줄 추가 (`Priority` 다음):

```typescript
        Priority: { select: { name: input.priority ?? "Medium" } },
        Tags: { multi_select: (input.tags ?? []).map((name) => ({ name })) },
        "Started At": { date: dateValue(input.started_at) },
        "Last Touched": { date: dateValue(input.last_touched) },
        "Session Count": { number: input.session_count ?? 0 },
        "Msg Total": { number: input.msg_total ?? 0 },
```

(6) `updateOperation()`에 5줄 추가 (`completed_at` 처리 앞):

```typescript
  if (updates.tags !== undefined) properties.Tags = { multi_select: updates.tags.map((name) => ({ name })) }
  if (updates.started_at !== undefined) properties["Started At"] = { date: dateValue(updates.started_at) }
  if (updates.last_touched !== undefined) properties["Last Touched"] = { date: dateValue(updates.last_touched) }
  if (updates.session_count !== undefined) properties["Session Count"] = { number: updates.session_count }
  if (updates.msg_total !== undefined) properties["Msg Total"] = { number: updates.msg_total }
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm run test -- lib/notion/operations.test.ts
```

Expected: PASS — 6 passed

- [ ] **Step 5: 기존 소비처 타입 확인**

```bash
npx tsc --noEmit
```

Expected: 에러 없음. `components/dakota/OperationsLedger.tsx`와 `app/api/dakota/operations/route.ts`는 `OperationItem`을 읽기만 하므로 속성 추가에 영향받지 않는다. 에러가 나면 해당 파일에서 새 속성을 필요로 하는 지점을 확인해 채운다.

- [ ] **Step 6: 커밋**

```bash
git add lib/notion/operations.ts lib/notion/operations.test.ts
git commit -m "feat(ledger): Operations 확장 속성 매핑 + Finance/Training 도메인"
```

---

### Task 6: LLM 승격

하루치 컨텍스트와 기존 과제 목록을 받아 승격 결과를 만든다. LLM 호출부를 주입 가능하게 만들어 테스트에서 대체한다.

**Files:**
- Create: `lib/dakota-ledger/promote.ts`
- Test: `lib/dakota-ledger/promote.test.ts`

**Interfaces:**
- Consumes: `DaySessions` from `./types`; `buildDayContext` from `./classify`; `OperationItem` from `@/lib/notion/operations`
- Produces:
  - `const promotionSchema` (zod)
  - `interface PromotedSession { sessionKey: string; name: string; summary: string; domain: LedgerDomain; tags: string[]; outcome: LedgerOutcome; agent: LedgerAgent; operationRef: string | null; originOverride: "수행" | null }`
  - `interface PromotedOperation { ref: string; name: string; domain: LedgerDomain; tags: string[]; type: string; status: string; priority: string; context: string; actionTaken: string; result: string; nextAction: string }`
  - `interface PromotionResult { sessions: PromotedSession[]; operations: PromotedOperation[] }`
  - `type Promoter = (prompt: string) => Promise<PromotionResult>`
  - `buildPrompt(day: DaySessions, existing: OperationItem[]): string`
  - `enforceRules(day: DaySessions, result: PromotionResult): PromotionResult`
  - `promoteDay(day, existing, promoter): Promise<PromotionResult>`
  - `createAnthropicPromoter(): Promoter`

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/dakota-ledger/promote.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest"
import { buildPrompt, effectiveOrigin, enforceRules, promoteDay } from "./promote"
import type { PromotedOperation, PromotedSession, PromotionResult } from "./promote"
import type { ClassifiedSession, DaySessions } from "./types"

function session(over: Partial<ClassifiedSession> = {}): ClassifiedSession {
  return {
    sessionKey: "s-1", channel: "telegram", startedAt: "2026-07-20T04:00:00.000Z",
    messageCount: 10, firstUserMessage: "정리해줘", lastAssistantMessage: "네",
    toolNames: [], origin: "지시", ...over,
  }
}

const DAY: DaySessions = {
  date: "2026-07-20",
  sessions: [session({ sessionKey: "s-1", origin: "지시" }), session({ sessionKey: "s-2", origin: "수행" })],
}

const EXISTING = [
  { page_id: "op-1", name: "AI 오픈채팅 signal intelligence", domain: "AI", status: "In Progress" },
] as never[]

describe("buildPrompt", () => {
  it("날짜·세션·기존 과제를 담는다", () => {
    const p = buildPrompt(DAY, EXISTING)
    expect(p).toContain("2026-07-20")
    expect(p).toContain("s-1")
    expect(p).toContain("AI 오픈채팅 signal intelligence")
    expect(p).toContain("op-1")
  })

  it("수행 세션이 신규 과제를 못 만든다는 규칙을 명시한다", () => {
    expect(buildPrompt(DAY, EXISTING)).toContain("수행")
  })
})

function promoted(over: Partial<PromotedSession> = {}): PromotedSession {
  return {
    sessionKey: "s-1", name: "a", summary: "", domain: "AI", tags: [],
    outcome: "완료", agent: "dakota", operationRef: null, originOverride: null, ...over,
  }
}

function newOp(ref: string): PromotedOperation {
  return {
    ref, name: "새 과제", domain: "AI", tags: [], type: "Execution",
    status: "In Progress", priority: "Medium", context: "", actionTaken: "",
    result: "", nextAction: "",
  }
}

describe("effectiveOrigin", () => {
  it("지시를 수행으로 강등한다", () => {
    expect(effectiveOrigin("지시", "수행")).toBe("수행")
  })

  it("논의를 수행으로 강등한다", () => {
    expect(effectiveOrigin("논의", "수행")).toBe("수행")
  })

  it("override가 없으면 휴리스틱을 그대로 쓴다", () => {
    expect(effectiveOrigin("지시", null)).toBe("지시")
    expect(effectiveOrigin("수행", null)).toBe("수행")
  })
})

describe("enforceRules", () => {
  it("수행 세션이 신규 과제를 참조하면 operationRef를 비운다", () => {
    const result: PromotionResult = {
      operations: [newOp("new:1")],
      sessions: [
        promoted({ sessionKey: "s-1", operationRef: "new:1" }),
        promoted({ sessionKey: "s-2", operationRef: "new:1" }),
      ],
    }
    const out = enforceRules(DAY, result)
    expect(out.sessions.find((s) => s.sessionKey === "s-1")!.operationRef).toBe("new:1")
    expect(out.sessions.find((s) => s.sessionKey === "s-2")!.operationRef).toBeNull()
  })

  it("LLM이 지시 세션을 수행으로 강등하면 신규 과제를 못 만든다", () => {
    // s-1은 휴리스틱상 지시지만 LLM이 디스패치로 판정
    const result: PromotionResult = {
      operations: [newOp("new:1")],
      sessions: [promoted({ sessionKey: "s-1", operationRef: "new:1", originOverride: "수행" })],
    }
    const out = enforceRules(DAY, result)
    expect(out.sessions[0].operationRef).toBeNull()
    expect(out.operations).toHaveLength(0)
  })

  it("LLM이 ref 규약을 어겨도 수행 세션은 신규 과제를 못 만든다", () => {
    // 프롬프트는 "new:1" 형식을 요구하지만 강제할 수단이 없다.
    // 접두사 판정만 있으면 이 케이스가 빠져나가 잡카드가 생긴다.
    const result: PromotionResult = {
      operations: [{ ...newOp("op-new-1") }],
      sessions: [promoted({ sessionKey: "s-2", operationRef: "op-new-1" })],
    }
    const out = enforceRules(DAY, result)
    expect(out.sessions[0].operationRef).toBeNull()
    expect(out.operations).toHaveLength(0)
  })

  it("수행 세션이 매달린 신규 ref를 참조해도 비운다", () => {
    // operations가 비어 있어 멤버십 판정으로는 안 잡히는 경우
    const result: PromotionResult = {
      operations: [],
      sessions: [promoted({ sessionKey: "s-2", operationRef: "new:9" })],
    }
    expect(enforceRules(DAY, result).sessions[0].operationRef).toBeNull()
  })

  it("수행 세션이 기존 과제를 참조하는 것은 허용한다", () => {
    const result: PromotionResult = {
      operations: [],
      sessions: [promoted({ sessionKey: "s-2", operationRef: "op-1" })],
    }
    expect(enforceRules(DAY, result).sessions[0].operationRef).toBe("op-1")
  })

  it("그날에 없는 세션 키는 버린다", () => {
    const result: PromotionResult = {
      operations: [],
      sessions: [promoted({ sessionKey: "s-999", name: "환각" })],
    }
    expect(enforceRules(DAY, result).sessions).toHaveLength(0)
  })

  it("아무 세션도 참조하지 않는 신규 과제는 버린다", () => {
    const result: PromotionResult = {
      operations: [newOp("new:9")],
      sessions: [],
    }
    expect(enforceRules(DAY, result).operations).toHaveLength(0)
  })
})

describe("promoteDay", () => {
  it("promoter 결과에 규칙을 적용해 돌려준다", async () => {
    const promoter = vi.fn().mockResolvedValue({
      operations: [],
      sessions: [promoted({ sessionKey: "s-2", operationRef: "new:1" })],
    } satisfies PromotionResult)

    const out = await promoteDay(DAY, EXISTING, promoter)
    expect(promoter).toHaveBeenCalledOnce()
    expect(out.sessions[0].operationRef).toBeNull()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npm run test -- lib/dakota-ledger/promote.test.ts
```

Expected: FAIL — `Failed to resolve import "./promote"`

- [ ] **Step 3: 구현**

`lib/dakota-ledger/promote.ts`:

```typescript
import { anthropic } from "@ai-sdk/anthropic"
import { generateObject } from "ai"
import { z } from "zod"
import type { OperationItem } from "@/lib/notion/operations"
import { buildDayContext } from "./classify"
import { LEDGER_DOMAINS, type DaySessions, type LedgerDomain, type LedgerOrigin } from "./types"

const promotedSessionSchema = z.object({
  sessionKey: z.string(),
  name: z.string(),
  summary: z.string(),
  domain: z.enum(LEDGER_DOMAINS as [LedgerDomain, ...LedgerDomain[]]),
  tags: z.array(z.string()),
  outcome: z.enum(["완료", "진행", "보류", "단발조회"]),
  agent: z.enum(["dakota", "elon", "brian", "andrej", "warren", "lo"]),
  operationRef: z.string().nullable(),
  /**
   * 휴리스틱이 지시/논의로 봤지만 본문상 명백한 에이전트 실행이면 "수행"을 넣는다.
   * 강등 전용이다 — 수행을 지시/논의로 올리는 방향은 enforceRules가 무시한다.
   */
  originOverride: z.enum(["수행"]).nullable(),
})

const promotedOperationSchema = z.object({
  ref: z.string(),
  name: z.string(),
  domain: z.enum(LEDGER_DOMAINS as [LedgerDomain, ...LedgerDomain[]]),
  tags: z.array(z.string()),
  type: z.enum(["Decision", "Execution", "Research", "Automation", "Draft"]),
  status: z.enum(["Inbox", "In Progress", "Waiting", "Completed", "Archived"]),
  priority: z.enum(["High", "Medium", "Low"]),
  context: z.string(),
  actionTaken: z.string(),
  result: z.string(),
  nextAction: z.string(),
})

export const promotionSchema = z.object({
  operations: z.array(promotedOperationSchema),
  sessions: z.array(promotedSessionSchema),
})

export type PromotedSession = z.infer<typeof promotedSessionSchema>
export type PromotedOperation = z.infer<typeof promotedOperationSchema>
export type PromotionResult = z.infer<typeof promotionSchema>

export type Promoter = (prompt: string) => Promise<PromotionResult>

export function buildPrompt(day: DaySessions, existing: OperationItem[]): string {
  const existingList = existing.length
    ? existing.map((o) => `- ${o.page_id} | ${o.name} | ${o.domain} | ${o.status}`).join("\n")
    : "(없음)"

  return `당신은 척추신경외과 의사 Tak 센터장의 운영 장부를 정리합니다.
아래는 하루치 에이전트 세션 기록입니다. 이것을 과제(Operation)와 세션 로그(Session)로 정리하세요.

## 규칙
1. Origin이 "지시" 또는 "논의"인 세션만 신규 과제를 만들 수 있습니다.
2. Origin이 "수행"인 세션은 신규 과제를 만들 수 없습니다. 기존 과제(아래 목록)에만 연결하고, 마땅한 과제가 없으면 operationRef를 null로 두세요.
3. 이미 존재하는 과제에 해당하면 새로 만들지 말고 그 page_id를 operationRef에 넣으세요.
4. 신규 과제를 만들 때는 ref를 "new:1", "new:2" 형식으로 붙이고, 그 과제에 속한 세션의 operationRef에 같은 값을 넣으세요.
5. 단순 조회·잡담이면 outcome을 "단발조회"로 하고 operationRef를 null로 두세요.
6. domain은 다음 9개 중 하나입니다: ${LEDGER_DOMAINS.join(", ")}. 투자·시장·지출은 Finance, BJJ·운동은 Training입니다.
7. tags는 domain을 가로지르는 성격을 넣습니다. 예: 연구 과제인데 AI 성격이면 tags에 "AI".
8. name은 한국어 한 줄, summary는 한국어 3~5줄로 씁니다.
9. 입력에 있는 sessionKey만 사용하세요. 없는 키를 지어내지 마세요.
10. 각 세션에는 이미 Origin(지시/논의/수행)이 붙어 있습니다. 그런데 지시나 논의로 붙은 것 중 본문을 보면 명백히 에이전트에게 내린 실행 프롬프트인 경우가 있습니다(정형화된 영어 명령문, 페르소나 지정, 산출물 형식 지정 등). 그런 세션은 originOverride에 "수행"을 넣으세요. 그 외에는 전부 null입니다. 수행으로 붙은 것을 지시나 논의로 되돌리는 값은 넣을 수 없습니다.

## 기존 과제 (page_id | 이름 | domain | status)
${existingList}

## 오늘의 세션
${buildDayContext(day)}`
}

/**
 * 세션의 실효 Origin. LLM은 지시/논의를 수행으로 강등만 할 수 있고,
 * 수행을 지시/논의로 올릴 수는 없다. 휴리스틱이 놓친 디스패치를 LLM이 잡되,
 * 휴리스틱이 이미 수행으로 판정한 것은 LLM이 되돌리지 못하게 한다.
 */
export function effectiveOrigin(
  heuristic: LedgerOrigin,
  override: "수행" | null
): LedgerOrigin {
  return override === "수행" ? "수행" : heuristic
}

/** LLM 출력이 규칙을 어겼을 때 코드로 강제한다. */
export function enforceRules(day: DaySessions, result: PromotionResult): PromotionResult {
  const originByKey = new Map(day.sessions.map((s) => [s.sessionKey, s.origin]))
  const newRefs = new Set(result.operations.map((o) => o.ref))

  const sessions = result.sessions
    .filter((s) => originByKey.has(s.sessionKey))
    .map((s) => {
      const origin = effectiveOrigin(originByKey.get(s.sessionKey)!, s.originOverride)
      // 규칙 2: 수행 세션은 신규 과제를 만들 수 없다.
      //
      // 판정을 두 겹으로 건다. 어느 하나도 다른 하나를 포함하지 못한다:
      //  - newRefs 멤버십은 operations에 없는 매달린 ref("new:1"만 있고 과제는 없음)를 놓친다.
      //  - "new:" 접두사는 LLM이 규약을 어기고 ref를 "op-new-1" 식으로 낸 경우를 놓친다.
      // 둘 중 하나라도 걸리면 신규로 본다.
      const ref = s.operationRef
      if (origin === "수행" && ref && (newRefs.has(ref) || ref.startsWith("new:"))) {
        return { ...s, operationRef: null }
      }
      return s
    })

  const usedRefs = new Set(sessions.map((s) => s.operationRef).filter(Boolean) as string[])
  const operations = result.operations.filter((o) => usedRefs.has(o.ref))

  return { operations, sessions }
}

export async function promoteDay(
  day: DaySessions,
  existing: OperationItem[],
  promoter: Promoter
): Promise<PromotionResult> {
  const raw = await promoter(buildPrompt(day, existing))
  return enforceRules(day, raw)
}

export function createAnthropicPromoter(): Promoter {
  const model = process.env.DAKOTA_LEDGER_MODEL ?? "claude-sonnet-5"
  return async (prompt: string) => {
    const { object } = await generateObject({
      model: anthropic(model),
      schema: promotionSchema,
      prompt,
    })
    return object
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm run test -- lib/dakota-ledger/promote.test.ts
```

Expected: PASS — 13 passed

- [ ] **Step 5: 커밋**

```bash
git add lib/dakota-ledger/promote.ts lib/dakota-ledger/promote.test.ts
git commit -m "feat(ledger): LLM 승격 + 수행 세션 규칙 코드 강제"
```

---

### Task 7: sync CLI

앞선 모듈을 조립한다. `--since`와 `--dry-run`을 받는다.

**Files:**
- Create: `scripts/dakota-ledger-sync.ts`
- Test: `scripts/dakota-ledger-sync.test.ts`
- Modify: `package.json` (scripts 항목)

**Interfaces:**
- Consumes: `readSessions` · `classifySessions` · `groupByDay` · `promoteDay` · `createAnthropicPromoter` · `getOperations` · `createOperation` · `updateOperation` · `listExistingSessionKeys` · `createSessionLog`
- Produces: `parseArgs(argv: string[]): { since: number; dryRun: boolean }` (테스트 대상), CLI 진입점

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/dakota-ledger-sync.test.ts`:

```typescript
import { describe, expect, it } from "vitest"
import { parseArgs } from "./dakota-ledger-sync"

const DAY = 86_400

describe("parseArgs", () => {
  it("--since 날짜를 KST 자정 epoch로 바꾼다", () => {
    const { since } = parseArgs(["--since", "2026-04-13"])
    // 2026-04-13 00:00 KST == 2026-04-12T15:00:00Z
    expect(since).toBe(Date.parse("2026-04-12T15:00:00.000Z") / 1000)
  })

  it("--since today는 오늘 KST 자정이다", () => {
    const { since } = parseArgs(["--since", "today"])
    const now = Math.floor(Date.now() / 1000)
    expect(since).toBeLessThanOrEqual(now)
    expect(now - since).toBeLessThan(DAY + 3600)
  })

  it("--since yesterday는 today보다 하루 이르다", () => {
    expect(parseArgs(["--since", "today"]).since - parseArgs(["--since", "yesterday"]).since).toBe(DAY)
  })

  it("--since 없으면 0이다", () => {
    expect(parseArgs([]).since).toBe(0)
  })

  it("--dry-run을 인식한다", () => {
    expect(parseArgs(["--dry-run"]).dryRun).toBe(true)
    expect(parseArgs([]).dryRun).toBe(false)
  })

  it("알 수 없는 --since 값은 던진다", () => {
    expect(() => parseArgs(["--since", "무엇"])).toThrow("--since")
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npm run test -- scripts/dakota-ledger-sync.test.ts
```

Expected: FAIL — `Failed to resolve import "./dakota-ledger-sync"`

- [ ] **Step 3: 구현**

`scripts/dakota-ledger-sync.ts`:

```typescript
import { classifySessions, groupByDay, toSeoulDate } from "../lib/dakota-ledger/classify"
import { createAnthropicPromoter, effectiveOrigin, promoteDay } from "../lib/dakota-ledger/promote"
import { readSessions } from "../lib/dakota-ledger/sessionSource"
import { createOperation, getOperations, updateOperation } from "../lib/notion/operations"
import { createSessionLog, listExistingSessionKeys } from "../lib/notion/sessionLog"

const DAY_SECONDS = 86_400

/** YYYY-MM-DD (KST 자정)을 epoch 초로 바꾼다. */
function seoulMidnightEpoch(date: string): number {
  return Date.parse(`${date}T00:00:00+09:00`) / 1000
}

export function parseArgs(argv: string[]): { since: number; dryRun: boolean } {
  const dryRun = argv.includes("--dry-run")
  const idx = argv.indexOf("--since")
  if (idx === -1) return { since: 0, dryRun }

  const value = argv[idx + 1] ?? ""
  if (value === "today") return { since: seoulMidnightEpoch(toSeoulDate(new Date().toISOString())), dryRun }
  if (value === "yesterday") {
    return { since: seoulMidnightEpoch(toSeoulDate(new Date().toISOString())) - DAY_SECONDS, dryRun }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { since: seoulMidnightEpoch(value), dryRun }

  throw new Error(`--since 값을 해석할 수 없습니다: "${value}" (YYYY-MM-DD | today | yesterday)`)
}

async function main() {
  const { since, dryRun } = parseArgs(process.argv.slice(2))
  const dbPath = process.env.HERMES_STATE_DB ?? `${process.env.HOME}/.hermes/state.db`

  const raw = readSessions(dbPath, since)
  const existingKeys = dryRun ? new Set<string>() : await listExistingSessionKeys()
  const fresh = raw.filter((s) => !existingKeys.has(s.sessionKey))

  console.log(`대상 ${raw.length}건 · 기적재 제외 후 ${fresh.length}건${dryRun ? " · DRY RUN" : ""}`)
  if (fresh.length === 0) return

  const days = groupByDay(classifySessions(fresh))
  console.log(`활동일 ${days.length}일`)

  const promoter = createAnthropicPromoter()
  let operations = await getOperations()

  for (const day of days) {
    const result = await promoteDay(day, operations, promoter)
    console.log(`[${day.date}] 세션 ${result.sessions.length} · 신규 과제 ${result.operations.length}`)

    if (dryRun) {
      for (const s of result.sessions) console.log(`   - ${s.domain} | ${s.outcome} | ${s.name}`)
      for (const o of result.operations) console.log(`   + 신규 과제: ${o.domain} | ${o.name}`)
      continue
    }

    // 신규 과제 생성 -> ref를 실제 page_id로 치환
    const refToPageId = new Map<string, string>()
    for (const op of result.operations) {
      const created = await createOperation({
        name: op.name, domain: op.domain, tags: op.tags,
        type: op.type, status: op.status, priority: op.priority,
        context: op.context, action_taken: op.actionTaken,
        result: op.result, next_action: op.nextAction,
        started_at: day.date, last_touched: day.date,
      })
      refToPageId.set(op.ref, created.page_id)
    }

    // 세션 로그 적재
    const touched = new Map<string, { count: number; msgs: number }>()
    for (const s of result.sessions) {
      const source = day.sessions.find((d) => d.sessionKey === s.sessionKey)!
      const pageId = s.operationRef ? (refToPageId.get(s.operationRef) ?? s.operationRef) : null

      await createSessionLog({
        name: s.name, date: source.startedAt, channel: source.channel,
        // 휴리스틱이 아니라 LLM 강등이 반영된 실효 Origin을 기록한다
        origin: effectiveOrigin(source.origin, s.originOverride),
        agent: s.agent, domain: s.domain, tags: s.tags,
        summary: s.summary, outcome: s.outcome, msgCount: source.messageCount,
        sessionKey: s.sessionKey, operationPageId: pageId,
      })

      if (pageId) {
        const prev = touched.get(pageId) ?? { count: 0, msgs: 0 }
        touched.set(pageId, { count: prev.count + 1, msgs: prev.msgs + source.messageCount })
      }
    }

    // 과제 집계·Last Touched 갱신
    for (const [pageId, delta] of touched) {
      const before = operations.find((o) => o.page_id === pageId)
      await updateOperation(pageId, {
        last_touched: day.date,
        session_count: (before?.session_count ?? 0) + delta.count,
        msg_total: (before?.msg_total ?? 0) + delta.msgs,
      })
    }

    // 다음 날 판정에 신규 과제가 보이도록 갱신
    operations = await getOperations()
  }

  console.log("완료")
}

if (process.argv[1]?.includes("dakota-ledger-sync")) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm run test -- scripts/dakota-ledger-sync.test.ts
```

Expected: PASS — 6 passed

- [ ] **Step 5: `package.json`에 스크립트 추가**

`scripts` 객체에 두 줄 추가:

```json
    "ledger:schema": "tsx --env-file=.env.local scripts/dakota-ledger-schema.ts",
    "ledger:sync": "tsx --env-file=.env.local scripts/dakota-ledger-sync.ts",
```

- [ ] **Step 6: dry-run으로 확인**

```bash
npm run ledger:sync -- --since 2026-07-15 --dry-run
```

Expected: `대상 N건 · 기적재 제외 후 N건 · DRY RUN`, 활동일 수, 날짜별로 세션·신규 과제 목록이 출력된다. Notion에는 아무것도 쓰이지 않는다.

출력에서 확인할 것:
- `Origin=수행` 세션이 `+ 신규 과제`를 만들지 않는지
- `Finance` / `Training` 도메인이 실제로 배정되는지

- [ ] **Step 7: 전체 테스트 + 커밋**

```bash
npm run test
git add scripts/dakota-ledger-sync.ts scripts/dakota-ledger-sync.test.ts package.json
git commit -m "feat(ledger): sync CLI — --since / --dry-run"
```

---

### Task 8: backfill 실행

3개월치를 실제로 적재한다. 되돌리기 어려우므로 좁은 구간부터 확인하며 넓힌다.

**Files:** 없음 (운영 작업)

- [ ] **Step 1: 최근 3일만 실제 적재**

```bash
npm run ledger:sync -- --since 2026-07-25
```

Expected: `[날짜] 세션 N · 신규 과제 M`이 날짜별로 출력되고 마지막에 `완료`.

- [ ] **Step 2: Notion에서 눈으로 확인**

Notion에서 `Dakota Session Log`를 연다. 확인할 것:

- `Session Key`가 채워져 있다
- `Origin=수행` 행의 `Operation`이 신규 과제가 아니라 기존 과제이거나 비어 있다
- `Domain`이 한쪽으로 쏠리지 않는다
- `Summary`가 한국어 3~5줄이다

`Dakota Operations`에서 `Started At` · `Last Touched` · `Session Count` · `Msg Total`이 채워졌는지 본다.

- [ ] **Step 3: 재실행 안전성 확인**

```bash
npm run ledger:sync -- --since 2026-07-25
```

Expected: `대상 N건 · 기적재 제외 후 0건`이 뜨고 즉시 끝난다. Notion에 중복 행이 생기지 않는다.

0이 아니면 `listExistingSessionKeys()`가 `Session Key`를 못 읽는 것이다. Task 4로 돌아간다.

- [ ] **Step 4: 전체 backfill**

```bash
npm run ledger:sync -- --since 2026-04-13 2>&1 | tee /tmp/ledger-backfill.log
```

Expected: 활동일 48일 내외가 순차 처리된다. LLM 호출이 활동일 수만큼 발생하므로 수 분 걸린다.

중간에 실패하면 로그의 마지막 성공 날짜 다음 날을 `--since`로 주어 이어서 돌린다. 이미 적재된 세션은 자동으로 걸러진다.

- [ ] **Step 5: 결과 집계**

```bash
npx tsx --env-file=.env.local -e '
import { getOperations } from "./lib/notion/operations"
const ops = await getOperations()
const byDomain: Record<string, number> = {}
for (const o of ops) byDomain[o.domain] = (byDomain[o.domain] ?? 0) + 1
console.log("과제:", ops.length)
console.log("도메인별:", byDomain)
console.log("세션 합계:", ops.reduce((a, o) => a + o.session_count, 0))
'
```

Expected: 과제 수가 backfill 전 13건보다 크게 늘고, 도메인이 3종 이상으로 퍼져 있다.

- [ ] **Step 6: 커밋 (로그 제외)**

```bash
git status --short
```

Expected: 커밋할 변경 없음 (backfill은 Notion 쪽 작업). 변경이 있으면 의도치 않은 것이므로 확인한다.

---

### Task 9: Notion 뷰 6종

Notion REST API 2022-06-28은 뷰 생성을 지원하지 않는다. Notion UI에서 만든다.

**Files:** 없음 (Notion UI 작업)

- [ ] **Step 1: Operations 뷰 4종**

`Dakota Operations`를 열고 아래 4개를 추가한다.

| 이름 | 종류 | 설정 |
|---|---|---|
| 칸반 | Board | Group by `Status` · Filter `Visibility` is `Dashboard` · 카드에 `Domain` `Priority` `Session Count` `Days Stalled` 표시 |
| 타임라인 | Timeline | Start `Started At` · End `Last Touched` · Color by `Domain` |
| 도메인 보드 | Board | Group by `Domain` |
| 정체 | Table | Filter `Status` is not `Completed` and `Status` is not `Archived` · Sort `Days Stalled` descending · 표시 `Name` `Domain` `Status` `Last Touched` `Days Stalled` `Next Action` |

- [ ] **Step 2: Session Log 뷰 2종**

`Dakota Session Log`를 열고 아래 2개를 추가한다.

| 이름 | 종류 | 설정 |
|---|---|---|
| 일지 | Table | Sort `Date` descending · 표시 `Date` `Name` `Domain` `Origin` `Outcome` `Operation` `Msg Count` |
| 캘린더 | Calendar | Date by `Date` |

- [ ] **Step 3: 육안 검증**

"정체" 뷰 맨 위에 가장 오래 방치된 과제가 오는지 본다. 스펙에서 지목한 `WSC26 faculty` · `진주 Hermes` · `UHS Sharjah`가 상위에 보이면 정상이다.

"타임라인" 뷰에서 6월~7월 구간에 막대가 그려지는지 본다. 비어 있으면 `Started At`이 안 채워진 것이므로 Task 7의 `createOperation` 호출을 확인한다.

---

### Task 10: launchd 스케줄 2개

Hermes cron은 LLM 프롬프트 실행기라 스크립트 구동에는 부적합하다. launchd를 쓴다 (`ai.hermes.gateway.plist`와 같은 방식).

**Files:**
- Create: `~/Library/LaunchAgents/com.takmd.dakota-ledger-day.plist`
- Create: `~/Library/LaunchAgents/com.takmd.dakota-ledger-night.plist`
- Create: `scripts/dakota-ledger-cron.sh`

- [ ] **Step 1: 실행 래퍼 작성**

`scripts/dakota-ledger-cron.sh`:

```bash
#!/bin/bash
# launchd에서 호출되는 래퍼. PATH가 빈약하므로 node를 명시적으로 찾는다.
set -euo pipefail

REPO="/Users/TakMD/workspace/spinoscopy-dashboard"
cd "$REPO"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

SINCE="${1:-today}"
echo "=== $(date '+%Y-%m-%d %H:%M:%S') --since $SINCE ==="
npx tsx --env-file=.env.local scripts/dakota-ledger-sync.ts --since "$SINCE"
```

```bash
chmod +x scripts/dakota-ledger-cron.sh
```

- [ ] **Step 2: 래퍼 수동 검증**

```bash
./scripts/dakota-ledger-cron.sh today
```

Expected: `=== 날짜 시각 --since today ===`에 이어 sync 출력. 이미 적재됐다면 `기적재 제외 후 0건`.

- [ ] **Step 3: 낮 plist 작성**

`~/Library/LaunchAgents/com.takmd.dakota-ledger-day.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.takmd.dakota-ledger-day</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/TakMD/workspace/spinoscopy-dashboard/scripts/dakota-ledger-cron.sh</string>
    <string>today</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>12</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>15</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>18</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>21</integer><key>Minute</key><integer>0</integer></dict>
  </array>
  <key>StandardOutPath</key><string>/tmp/dakota-ledger-day.log</string>
  <key>StandardErrorPath</key><string>/tmp/dakota-ledger-day.err</string>
</dict>
</plist>
```

- [ ] **Step 4: 야간 plist 작성**

`~/Library/LaunchAgents/com.takmd.dakota-ledger-night.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.takmd.dakota-ledger-night</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/TakMD/workspace/spinoscopy-dashboard/scripts/dakota-ledger-cron.sh</string>
    <string>yesterday</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>23</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>/tmp/dakota-ledger-night.log</string>
  <key>StandardErrorPath</key><string>/tmp/dakota-ledger-night.err</string>
</dict>
</plist>
```

- [ ] **Step 5: 등록**

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.takmd.dakota-ledger-day.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.takmd.dakota-ledger-night.plist
launchctl list | grep dakota-ledger
```

Expected: `com.takmd.dakota-ledger-day`와 `com.takmd.dakota-ledger-night` 두 줄.

- [ ] **Step 6: 즉시 실행으로 검증**

```bash
launchctl kickstart -p gui/$(id -u)/com.takmd.dakota-ledger-day
sleep 20 && cat /tmp/dakota-ledger-day.log && cat /tmp/dakota-ledger-day.err
```

Expected: `.log`에 sync 출력이 있고 `.err`는 비어 있다. `.err`에 `command not found`가 있으면 Step 1의 `PATH`에 실제 node 경로를 추가한다 (`which node`로 확인).

- [ ] **Step 7: 커밋**

```bash
git add scripts/dakota-ledger-cron.sh
git commit -m "feat(ledger): launchd 스케줄 래퍼 (낮 5회 / 야간 1회)"
```

plist는 저장소 밖(`~/Library/LaunchAgents`)이라 커밋 대상이 아니다.

---

### Task 11: Memory DB 오염 분리

orchestrator 이벤트가 장기기억 DB(`Dakota Memory`)에 raw 행을 쌓는 것을 끊는다.

**Files:**
- Modify: `lib/orchestrator/notionEventStore.ts:31`
- Test: `lib/orchestrator/notionEventStore.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `isNotionEventStoreAvailable()`이 `NOTION_DAKOTA_EVENT_DB_ID`를 보도록 바뀐다. 미설정이면 `false`를 반환해 파일 스토어(`.superpowers/orchestrator/events.json`)로만 동작한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/orchestrator/notionEventStore.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { isNotionEventStoreAvailable } from "./notionEventStore"

const OLD_ENV = { ...process.env }

beforeEach(() => {
  process.env.NOTION_TOKEN = "test-token"
  delete process.env.NOTION_DAKOTA_MEMORY_DB_ID
  delete process.env.NOTION_DAKOTA_EVENT_DB_ID
})

afterEach(() => {
  process.env = { ...OLD_ENV }
})

describe("isNotionEventStoreAvailable", () => {
  it("전용 이벤트 DB가 없으면 비활성이다", () => {
    expect(isNotionEventStoreAvailable()).toBe(false)
  })

  it("Memory DB만 설정돼 있어도 비활성이다 — 장기기억을 오염시키지 않는다", () => {
    process.env.NOTION_DAKOTA_MEMORY_DB_ID = "memory-db"
    expect(isNotionEventStoreAvailable()).toBe(false)
  })

  it("전용 이벤트 DB가 있으면 활성이다", () => {
    process.env.NOTION_DAKOTA_EVENT_DB_ID = "event-db"
    expect(isNotionEventStoreAvailable()).toBe(true)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npm run test -- lib/orchestrator/notionEventStore.test.ts
```

Expected: FAIL — 두 번째 테스트가 `true`를 받아 실패한다 (현재는 Memory DB를 본다)

- [ ] **Step 3: 구현**

`lib/orchestrator/notionEventStore.ts`의 31번째 줄을 교체한다.

변경 전:

```typescript
  const dbId = process.env.NOTION_DAKOTA_MEMORY_DB_ID?.trim()
```

변경 후:

```typescript
  // 장기기억 DB(NOTION_DAKOTA_MEMORY_DB_ID)에 raw 이벤트를 쌓지 않는다.
  // 전용 이벤트 DB가 설정된 경우에만 Notion에 기록하고, 아니면 파일 스토어만 쓴다.
  const dbId = process.env.NOTION_DAKOTA_EVENT_DB_ID?.trim()
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm run test -- lib/orchestrator/notionEventStore.test.ts
```

Expected: PASS — 3 passed

- [ ] **Step 5: 전체 테스트 + 타입 확인**

```bash
npm run test && npx tsc --noEmit
```

Expected: 전부 통과, 타입 에러 없음

- [ ] **Step 6: 기존 오염 행 정리 안내**

`Dakota Memory` DB를 Notion에서 열고 `Name`이 `dakota summarized ·` 또는 `dakota received ·` 등으로 시작하는 행을 필터로 모아 삭제한다. 이 정리는 수동이며, 위 코드 변경으로 추가 유입은 멈춘다.

- [ ] **Step 7: 커밋**

```bash
git add lib/orchestrator/notionEventStore.ts lib/orchestrator/notionEventStore.test.ts
git commit -m "fix(orchestrator): raw 이벤트가 장기기억 DB를 오염시키지 않게 분리"
```

---

## 완료 기준

- [ ] `npm run test` 전부 통과
- [ ] `npx tsc --noEmit` 에러 없음
- [ ] `Dakota Session Log`에 2026-04-13 이후 세션이 적재되어 있고 `Session Key`가 전부 채워져 있다
- [ ] 같은 `--since`로 재실행하면 `기적재 제외 후 0건`이 뜬다
- [ ] `Origin=수행` 세션이 만든 신규 과제가 0건이다
- [ ] Notion "정체" 뷰에서 방치 과제가 `Days Stalled` 내림차순으로 보인다
- [ ] `launchctl list | grep dakota-ledger`에 두 줄이 보인다
- [ ] `Dakota Memory`에 새 raw 이벤트 행이 더는 생기지 않는다

## 다음 계획 (Plan B)

backfill 결과를 보고 대시보드 카테고리 렌즈를 설계한다. 실제 데이터 밀도를 확인한 뒤 착수한다.

- 도메인이 실제로 몇 개나 채워졌는지 → 비중 도넛·추세 그래프의 계열 수
- 요일×시간대 격자가 얼마나 성기는지 → 히트맵을 쓸지 다른 표현을 쓸지
- 정체 과제가 몇 건인지 → 경보 패널의 형태

차트는 이미 의존성에 있는 `recharts`를 쓴다. 착수 전 `dataviz` 스킬을 읽는다.

---

## 수정 웨이브: sync 견고성 (Task 7 리뷰 후속)

Task 7 리뷰에서 Important 3건이 나왔다. 이 스크립트는 되돌릴 수 없는 Notion 쓰기를
하루 6번 수행하므로 셋 다 수정한다. 아래가 최종 상태이며, Task 4·5·7의 해당 부분을 대체한다.

### I1 — dry-run이 기적재 조회를 건너뛴다

`--dry-run`에서 `listExistingSessionKeys()`를 호출하지 않아 "기적재 제외 후 N건"이
항상 원본 개수와 같고, 이미 적재된 세션까지 LLM에 다시 넣는다. 조회는 읽기이므로
무조건 수행하고 **쓰기만** 건너뛴다.

### I2 — 집계를 델타로 누적해 크래시 시 영구 어긋남

`session_count`/`msg_total`을 "기존값 + 오늘치"로 갱신하는데, 하루 처리 도중 크래시하면
이미 적재된 세션은 다음 런에서 `Session Key`로 영구 제외되므로 그 공수가 절대 반영되지 않는다.

**절대값 재계산으로 바꾼다.** 이미 Session Log 전체를 훑고 있으므로 그 순회에서
과제별 집계도 함께 모은다. 추가 API 호출은 없다.

`lib/notion/sessionLog.ts`에서 `listExistingSessionKeys()`를 아래로 대체한다.

```typescript
export interface SessionLogSnapshot {
  /** 이미 적재된 Session Key 전체 */
  keys: Set<string>
  /** 과제 page_id -> 이미 적재된 세션의 집계 */
  byOperation: Map<string, { count: number; msgs: number }>
}

/**
 * Session Log 전체를 한 번 훑어 중복 방지 키와 과제별 집계를 함께 반환한다.
 * 집계를 델타로 누적하지 않고 매 런 실측에서 다시 세우므로,
 * 이전 런이 도중에 죽어도 다음 런이 스스로 바로잡는다.
 */
export async function readSessionLogSnapshot(): Promise<SessionLogSnapshot>
```

`Session Key`에 더해 `Msg Count`(number)와 `Operation`(relation의 첫 id)을 읽는다.
`Operation`이 비어 있으면 `byOperation`에 넣지 않는다.

`scripts/dakota-ledger-sync.ts`는 스냅샷을 런 시작에 한 번 읽고,
런 안에서 누적되는 사본을 유지하며 **절대값**을 쓴다.

```typescript
const snapshot = await readSessionLogSnapshot()
const running = new Map(snapshot.byOperation)
// ... 날짜 루프 안에서
for (const [pageId, delta] of touched) {
  const base = running.get(pageId) ?? { count: 0, msgs: 0 }
  const next = { count: base.count + delta.count, msgs: base.msgs + delta.msgs }
  running.set(pageId, next)
  await updateOperation(pageId, {
    last_touched: day.date,
    session_count: next.count,
    msg_total: next.msgs,
  })
}
```

`getOperations()`에서 baseline을 읽던 `before?.session_count` 경로는 제거한다. 그것이 드리프트의 원인이었다.

### I3 — 가드가 필터·페이지 제한이 걸린 목록을 본다

환각 `operationRef`를 막는 가드가 `getOperations()` 결과를 기준으로 삼는데,
그 함수는 `Visibility != Private` 필터와 `page_size: 100`(페이지네이션 없음)이 걸려 있다.
따라서 Private 과제나 100건을 넘어간 과제를 정당하게 참조해도 조용히 연결이 끊긴다.
한 번 끊기면 그 세션은 다음 런에서 제외되므로 복구 경로가 없다.

`lib/notion/operations.ts`에 가드 전용 조회를 추가한다.

```typescript
/**
 * 가드 전용. Visibility 필터 없이 전수를 페이지네이션해 page_id만 모은다.
 * getOperations()는 대시보드 표시용이라 Private을 빼고 100건에서 끊기므로
 * 참조 유효성 판정에는 쓸 수 없다.
 */
export async function listAllOperationPageIds(): Promise<Set<string>>
```

sync의 가드는 `refToPageId`(이번 런에서 만든 것) 다음으로 이 집합을 본다.

### 남기는 것

- `createAnthropicPromoter`의 `generateObject` 에러 처리 없음 — 실패 시 그 날짜에서 런이 죽고,
  다음 런이 이어서 처리한다. I2 수정으로 집계가 자가치유되므로 부분 실패가 안전해졌다.
- `fresh.length === 0`일 때 `완료`를 안 찍는 로그 불일치 — 정보성.

---

## 변경: LLM을 Anthropic API에서 Codex(ChatGPT OAuth)로

센터장님 결정 — backfill과 sync의 LLM 호출을 API 키가 아니라 이미 로그인된
ChatGPT OAuth로 수행한다. `ANTHROPIC_API_KEY`는 더 이상 필요 없다.

`createAnthropicPromoter()`를 **삭제하고** `createCodexPromoter()`로 대체한다.
쓰지 않을 경로를 남기지 않는다.

### 실측 (2026-07-27)

| 항목 | 값 |
|---|---|
| codex CLI | `/Users/TakMD/.local/bin/codex` v0.145.0, `~/.codex/auth.json`로 OAuth 인증됨 |
| 호출당 소요 | 약 7.3초 (`--ignore-user-config` 적용 시. 미적용 시 45초+) |
| 호출당 입력 토큰 | 약 20.9k (에이전트 기본 프롬프트. 더 줄일 수 없음) |
| backfill 총량 | 48일 × 7.3초 ≈ 6분 |

두 함정이 있었다. 둘 다 반드시 피해야 한다.

1. **stdin 대기.** 프롬프트를 인자로 줘도 codex는 stdin을 계속 읽어 무한 대기한다.
   `stdio[0]`을 `"ignore"`로 두어야 한다(셸에서는 `</dev/null`).
2. **사용자 설정 로딩.** `--ignore-user-config` 없이 돌리면 스킬·플러그인 설명이
   컨텍스트에 실려 호출이 6배 느려진다. 인증은 이 플래그와 무관하게 유지된다.

### 구현

`lib/dakota-ledger/promote.ts`

```typescript
/** codex의 JSONL 이벤트 스트림에서 최종 agent_message 본문을 뽑는다. */
export function extractAgentMessage(jsonl: string): string {
  let last: string | null = null
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue
    let event: { type?: string; item?: { type?: string; text?: string } }
    try {
      event = JSON.parse(line)
    } catch {
      continue // codex는 사람용 로그 줄을 섞어 낸다
    }
    if (event.type === "item.completed" && event.item?.type === "agent_message" && event.item.text) {
      last = event.item.text
    }
  }
  if (!last) throw new Error(`codex 응답에서 agent_message를 찾지 못했습니다:\n${jsonl.slice(-800)}`)
  return last
}

export function createCodexPromoter(): Promoter {
  const bin = process.env.CODEX_BIN ?? "codex"
  const schemaPath = path.join(os.tmpdir(), "dakota-ledger-schema.json")
  writeFileSync(schemaPath, JSON.stringify(z.toJSONSchema(promotionSchema, { target: "draft-7" })))

  const args = [
    "exec", "--json", "--ignore-user-config",
    "--output-schema", schemaPath,
    "--skip-git-repo-check", "--sandbox", "read-only",
  ]
  const model = process.env.DAKOTA_LEDGER_MODEL
  if (model) args.push("--model", model)

  return async (prompt: string) => {
    const stdout = execFileSync(bin, [...args, prompt], {
      stdio: ["ignore", "pipe", "pipe"],   // stdin 차단이 핵심
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    })
    return promotionSchema.parse(JSON.parse(extractAgentMessage(stdout)))
  }
}
```

`scripts/dakota-ledger-sync.ts`는 `createAnthropicPromoter()` 대신 `createCodexPromoter()`를 부른다.

`launchd`는 PATH가 빈약하므로 `scripts/dakota-ledger-cron.sh`의 PATH에
`/Users/TakMD/.local/bin`을 추가하거나 `CODEX_BIN`을 절대경로로 지정한다.

### 테스트

`extractAgentMessage`는 순수 함수이므로 전부 단위 테스트한다. codex는 실행하지 않는다.

- 여러 `agent_message` 중 **마지막** 것을 고른다
- JSON이 아닌 줄(`Reading additional input from stdin...`)을 건너뛴다
- `item.completed`이지만 `type`이 `error`인 항목은 무시한다
- `agent_message`가 없으면 던지고, 메시지에 원본 꼬리가 담긴다

`.env.local`에서 `ANTHROPIC_API_KEY`는 불필요. `DAKOTA_LEDGER_MODEL`은 선택(미설정 시 codex 기본 모델).
