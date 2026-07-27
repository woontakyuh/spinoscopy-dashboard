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
