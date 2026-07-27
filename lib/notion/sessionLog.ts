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
    cursor = res.has_more ? res.next_cursor : null
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
