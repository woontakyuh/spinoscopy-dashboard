import { notionRequest } from "@/lib/notion/client"
import type { AgentEvent } from "./types"

interface NotionRichText {
  plain_text?: string
}

interface NotionProperty {
  type: string
  title?: NotionRichText[]
  rich_text?: NotionRichText[]
  select?: { name: string } | null
  created_time?: string
  last_edited_time?: string
}

interface NotionPage {
  id: string
  created_time: string
  last_edited_time: string
  properties: Record<string, NotionProperty>
}

interface NotionQueryResponse {
  results: NotionPage[]
  next_cursor: string | null
  has_more: boolean
}

function getDbId(): string | null {
  // 장기기억 DB(NOTION_DAKOTA_MEMORY_DB_ID)에 raw 이벤트를 쌓지 않는다.
  // 전용 이벤트 DB가 설정된 경우에만 Notion에 기록하고, 아니면 파일 스토어만 쓴다.
  const dbId = process.env.NOTION_DAKOTA_EVENT_DB_ID?.trim()
  const token = process.env.NOTION_TOKEN?.trim()
  if (!dbId || !token) return null
  return dbId
}

function getText(prop: NotionProperty | undefined): string {
  if (!prop) return ""
  if (prop.type === "title") return (prop.title ?? []).map((t) => t.plain_text ?? "").join("").trim()
  if (prop.type === "rich_text") return (prop.rich_text ?? []).map((t) => t.plain_text ?? "").join("").trim()
  return ""
}

function buildEventRowName(event: AgentEvent): string {
  const head = `${event.agent} ${event.kind}`
  const summary = event.summary.replace(/\s+/g, " ").trim()
  return `${head} · ${summary}`.slice(0, 180)
}

function getEventSourcePrefix(): string {
  return "orchestrator:event"
}

function getEventSource(event: AgentEvent): string {
  return `${getEventSourcePrefix()}:${event.agent}:${event.channel}`.slice(0, 100)
}

function serializeEvent(event: AgentEvent): string {
  return JSON.stringify(event)
}

function parseEventFromPage(page: NotionPage): AgentEvent | null {
  const props = page.properties
  const source = props.Source?.select?.name ?? ""
  const category = props.Category?.select?.name ?? ""
  if (category !== "event") return null
  if (!source.toLowerCase().startsWith(getEventSourcePrefix())) return null

  const raw = getText(props.Content)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as AgentEvent
    if (!parsed?.id || !parsed?.ts || !parsed?.agent || !parsed?.kind || !parsed?.summary) return null
    return parsed
  } catch {
    return null
  }
}

export function isNotionEventStoreAvailable(): boolean {
  return Boolean(getDbId())
}

export async function appendNotionAgentEvent(event: AgentEvent): Promise<void> {
  const dbId = getDbId()
  if (!dbId) return

  await notionRequest("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: {
        Name: { title: [{ text: { content: buildEventRowName(event) } }] },
        Category: { select: { name: "event" } },
        Content: { rich_text: [{ text: { content: serializeEvent(event).slice(0, 1900) } }] },
        Importance: { select: { name: "1" } },
        Source: { select: { name: getEventSource(event) } },
        Status: { select: { name: "archived" } },
      },
    }),
  })
}

export async function listNotionAgentEvents(limit = 50): Promise<AgentEvent[]> {
  const dbId = getDbId()
  if (!dbId) return []

  const response = await notionRequest<NotionQueryResponse>(`/databases/${dbId}/query`, {
    method: "POST",
    body: JSON.stringify({
      page_size: Math.min(Math.max(limit, 1), 100),
      sorts: [{ timestamp: "created_time", direction: "descending" }],
      filter: {
        and: [
          { property: "Category", select: { equals: "event" } },
          { property: "Status", select: { equals: "archived" } },
        ],
      },
    }),
  })

  return response.results
    .map(parseEventFromPage)
    .filter((event): event is AgentEvent => Boolean(event))
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, limit)
}
