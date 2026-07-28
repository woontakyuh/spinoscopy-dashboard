import { notionRequest } from "./client"

/**
 * Dakota Conversation Logs DB. 페르소나가 Claude Desktop 대화 종료 시 직접
 * 요약을 남기는 곳이다 (서버 사이드 대화라 사후 복구가 안 되므로 이게 유일한 소스).
 *
 * 기본값 문서화용: 이 DB의 id는 3e7bf6e4-a87c-4c49-9c82-17efd3e70c90 이다.
 * 하드코딩 폴백으로 쓰지 않는다 — 항상 env에서만 읽는다.
 */
const CONVERSATION_DB_ID_KEY = "NOTION_DAKOTA_CONVERSATION_DB_ID"

interface NotionProperty {
  type: string
  title?: Array<{ plain_text?: string }>
  rich_text?: Array<{ plain_text?: string }>
  select?: { name: string } | null
  multi_select?: Array<{ name: string }>
  date?: { start: string; end: string | null } | null
}

interface NotionPage {
  id: string
  properties: Record<string, NotionProperty>
}

interface NotionQueryResponse {
  results: NotionPage[]
  has_more: boolean
  next_cursor: string | null
}

export interface ConversationLogRow {
  pageId: string
  title: string
  /** ISO 8601, Date 프로퍼티가 비어 있으면 null */
  date: string | null
  channel: string | null
  summary: string
  decisions: string
  keyFacts: string
  actionItems: string
  topics: string[]
}

function plainText(values: Array<{ plain_text?: string }> | undefined): string {
  return (values ?? []).map((v) => v.plain_text ?? "").join("").trim()
}

function toRow(page: NotionPage): ConversationLogRow {
  const p = page.properties
  return {
    pageId: page.id,
    title: plainText(p.Title?.title),
    date: p.Date?.date?.start ?? null,
    channel: p.Channel?.select?.name ?? null,
    summary: plainText(p.Summary?.rich_text),
    decisions: plainText(p.Decisions?.rich_text),
    keyFacts: plainText(p["Key Facts"]?.rich_text),
    actionItems: plainText(p["Action Items"]?.rich_text),
    topics: (p.Topics?.multi_select ?? []).map((t) => t.name),
  }
}

export function getConversationDbId(): string | null {
  return process.env[CONVERSATION_DB_ID_KEY] ?? null
}

export interface ConversationQueryOptions {
  channel?: string
  /** YYYY-MM-DD, Date >= 이 값 (on_or_after) */
  sinceDate?: string
}

function buildFilter(options: ConversationQueryOptions): Record<string, unknown> | undefined {
  const filters: Record<string, unknown>[] = []
  if (options.channel) filters.push({ property: "Channel", select: { equals: options.channel } })
  if (options.sinceDate) filters.push({ property: "Date", date: { on_or_after: options.sinceDate } })
  if (filters.length === 0) return undefined
  if (filters.length === 1) return filters[0]
  return { and: filters }
}

export async function listConversationRows(options: ConversationQueryOptions = {}): Promise<ConversationLogRow[]> {
  const dbId = getConversationDbId()
  if (!dbId) return []

  const filter = buildFilter(options)
  const results: NotionPage[] = []
  let cursor: string | null = null
  do {
    const res: NotionQueryResponse = await notionRequest<NotionQueryResponse>(`/databases/${dbId}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        ...(filter ? { filter } : {}),
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    })
    results.push(...res.results)
    // sessionLog.ts와 같은 이유로 조용히 멈추지 않고 던진다.
    if (res.has_more) {
      if (!res.next_cursor) {
        throw new Error("Notion 페이지네이션 오류: has_more=true인데 next_cursor가 없습니다 (Conversation Logs)")
      }
      cursor = res.next_cursor
    } else {
      cursor = null
    }
  } while (cursor)

  return results.map(toRow)
}
