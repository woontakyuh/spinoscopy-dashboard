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

interface SessionLogProperty {
  type: string
  rich_text?: Array<{ plain_text?: string }>
  number?: number | null
  relation?: Array<{ id: string }>
}

interface QueryResponse {
  results: Array<{ properties: Record<string, SessionLogProperty> }>
  has_more: boolean
  next_cursor: string | null
}

export interface SessionLogSnapshot {
  /** 이미 적재된 Session Key 전체 */
  keys: Set<string>
  /** 과제 page_id -> 이미 적재된 세션의 집계 */
  byOperation: Map<string, { count: number; msgs: number }>
}

/** 대시보드 읽기 경로용 세션 로그 항목. */
export interface SessionLogItem {
  sessionKey: string
  name: string
  /** ISO 8601 (Notion Date 프로퍼티), 없으면 null */
  date: string | null
  channel: LedgerChannel | null
  origin: LedgerOrigin | null
  agent: LedgerAgent | null
  domain: LedgerDomain | null
  tags: string[]
  summary: string
  outcome: LedgerOutcome | null
  msgCount: number
  operationPageId: string | null
}

interface NotionSessionLogProperty {
  type: string
  title?: Array<{ plain_text?: string }>
  rich_text?: Array<{ plain_text?: string }>
  select?: { name: string } | null
  multi_select?: Array<{ name: string }>
  number?: number | null
  date?: { start: string; end: string | null } | null
  relation?: Array<{ id: string }>
}

interface NotionSessionLogPage {
  id: string
  properties: Record<string, NotionSessionLogProperty>
}

interface NotionSessionLogQueryResponse {
  results: NotionSessionLogPage[]
  has_more: boolean
  next_cursor: string | null
}

function plainText(values: Array<{ plain_text?: string }> | undefined): string {
  return (values ?? []).map((v) => v.plain_text ?? "").join("").trim()
}

function toSessionLogItem(page: NotionSessionLogPage): SessionLogItem {
  const p = page.properties
  return {
    sessionKey: plainText(p["Session Key"]?.rich_text),
    name: plainText(p.Name?.title),
    date: p.Date?.date?.start ?? null,
    channel: (p.Channel?.select?.name as LedgerChannel | undefined) ?? null,
    origin: (p.Origin?.select?.name as LedgerOrigin | undefined) ?? null,
    agent: (p.Agent?.select?.name as LedgerAgent | undefined) ?? null,
    domain: (p.Domain?.select?.name as LedgerDomain | undefined) ?? null,
    tags: (p.Tags?.multi_select ?? []).map((t) => t.name),
    summary: plainText(p.Summary?.rich_text),
    outcome: (p.Outcome?.select?.name as LedgerOutcome | undefined) ?? null,
    msgCount: p["Msg Count"]?.number ?? 0,
    operationPageId: p.Operation?.relation?.[0]?.id ?? null,
  }
}

/**
 * Session Log 전체를 읽어 대시보드 집계용으로 반환한다. readSessionLogSnapshot과 달리
 * dedup 키/과제별 합계가 아니라 세션 하나하나의 온전한 레코드가 필요할 때 쓴다.
 */
export async function listSessionLogs(): Promise<SessionLogItem[]> {
  const dbId = getSessionLogDbId()
  if (!dbId) return []

  const results: NotionSessionLogPage[] = []
  let cursor: string | null = null
  do {
    const res: NotionSessionLogQueryResponse = await notionRequest<NotionSessionLogQueryResponse>(`/databases/${dbId}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    })
    results.push(...res.results)
    // I3와 같은 이유로 조용한 진행 대신 던진다.
    if (res.has_more) {
      if (!res.next_cursor) {
        throw new Error("Notion 페이지네이션 오류: has_more=true인데 next_cursor가 없습니다 (Session Log list)")
      }
      cursor = res.next_cursor
    } else {
      cursor = null
    }
  } while (cursor)

  return results.map(toSessionLogItem)
}

export function getSessionLogDbId(): string | null {
  return process.env[SESSION_LOG_DB_ID_KEY] ?? null
}

function richText(content: string): Array<{ text: { content: string } }> {
  const safe = content.trim().slice(0, 1800)
  return safe ? [{ text: { content: safe } }] : []
}

/**
 * Session Log 전체를 한 번 훑어 중복 방지 키와 과제별 집계를 함께 반환한다.
 * 집계를 델타로 누적하지 않고 매 런 실측에서 다시 세우므로,
 * 이전 런이 도중에 죽어도 다음 런이 스스로 바로잡는다.
 */
export async function readSessionLogSnapshot(): Promise<SessionLogSnapshot> {
  const dbId = getSessionLogDbId()
  const keys = new Set<string>()
  const byOperation = new Map<string, { count: number; msgs: number }>()
  if (!dbId) return { keys, byOperation }

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
      const key = (page.properties["Session Key"]?.rich_text ?? [])
        .map((t) => t.plain_text ?? "").join("").trim()
      if (key) keys.add(key)

      const operationId = page.properties.Operation?.relation?.[0]?.id
      if (operationId) {
        const msgCount = page.properties["Msg Count"]?.number ?? 0
        const prev = byOperation.get(operationId) ?? { count: 0, msgs: 0 }
        byOperation.set(operationId, { count: prev.count + 1, msgs: prev.msgs + msgCount })
      }
    }
    // I3: has_more=true인데 next_cursor가 없으면 조용히 멈추던 버그.
    // 여기서 멈추면 dedup 스냅샷이 반쪽만 채워지고, 다음 런이 잘려나간 세션들을 "신규"로
    // 착각해 Session Log 행을 하나씩 더 써버린다 — 조용한 진행보다 시끄러운 실패가 낫다.
    if (res.has_more) {
      if (!res.next_cursor) {
        throw new Error("Notion 페이지네이션 오류: has_more=true인데 next_cursor가 없습니다 (Session Log)")
      }
      cursor = res.next_cursor
    } else {
      cursor = null
    }
  } while (cursor)

  return { keys, byOperation }
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
