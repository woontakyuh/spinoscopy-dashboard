// Dakota 장기 기억 저장소
// 기존 NOTION_TODO_DB_ID를 재활용 — 특수 todo 1건의 Notes 필드에 저장
// 마커 이름 + Done 상태로 일반 할 일 목록과 분리됨

import { notionRequest } from "./client"
import { getTodoDbId } from "./todo"

export const DAKOTA_MEMORY_MARKER = "📒 Dakota Memory"
const NOTES_MAX_CHARS = 1800

interface NotionRichText { plain_text?: string }
interface NotionMemoryPage {
  id: string
  url: string
  properties: {
    Name?: { title?: NotionRichText[] }
    Notes?: { rich_text?: NotionRichText[] }
  }
}
interface NotionQueryResponse {
  results: NotionMemoryPage[]
}

interface MemoryRow {
  pageId: string
  text: string
}

async function findMemoryRow(): Promise<MemoryRow | null> {
  const dbId = getTodoDbId()
  const response = await notionRequest<NotionQueryResponse>(`/databases/${dbId}/query`, {
    method: "POST",
    body: JSON.stringify({
      filter: {
        property: "Name",
        title: { equals: DAKOTA_MEMORY_MARKER },
      },
      page_size: 1,
    }),
  })
  const page = response.results[0]
  if (!page) return null
  const text = (page.properties.Notes?.rich_text ?? [])
    .map((rt) => rt.plain_text ?? "")
    .join("")
    .trim()
  return { pageId: page.id, text }
}

async function createMemoryRow(text: string): Promise<MemoryRow> {
  const dbId = getTodoDbId()
  const safe = text.slice(0, NOTES_MAX_CHARS)
  const response = await notionRequest<{ id: string }>("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: {
        Name: { title: [{ text: { content: DAKOTA_MEMORY_MARKER } }] },
        Status: { select: { name: "Done" } },
        Notes: {
          rich_text: safe ? [{ text: { content: safe } }] : [],
        },
      },
    }),
  })
  return { pageId: response.id, text: safe }
}

export async function getDakotaMemory(): Promise<string> {
  const row = await findMemoryRow()
  return row?.text ?? ""
}

export async function setDakotaMemory(text: string): Promise<void> {
  const safe = text.slice(0, NOTES_MAX_CHARS)
  const row = await findMemoryRow()
  if (!row) {
    await createMemoryRow(safe)
    return
  }
  await notionRequest(`/pages/${row.pageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        Notes: {
          rich_text: safe ? [{ text: { content: safe } }] : [],
        },
      },
    }),
  })
}

// ─── 원문 대화 archive (페이지 children에 paragraph block으로 append) ─────
const BLOCK_TEXT_MAX = 1900

async function ensureMemoryPageId(): Promise<string> {
  const row = await findMemoryRow()
  if (row) return row.pageId
  const created = await createMemoryRow("")
  return created.pageId
}

interface ParagraphBlock {
  object: "block"
  type: "paragraph"
  paragraph: { rich_text: Array<{ type: "text"; text: { content: string } }> }
}

function makeParagraph(content: string): ParagraphBlock {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content: content.slice(0, BLOCK_TEXT_MAX) } }],
    },
  }
}

export async function appendDakotaLogExchanges(
  exchanges: Array<{ role: "user" | "assistant"; content: string }>
): Promise<void> {
  if (exchanges.length === 0) return
  const pageId = await ensureMemoryPageId()
  const ts = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
  const blocks = exchanges.map((m) =>
    makeParagraph(`[${ts}] ${m.role === "user" ? "센터장" : "Dakota"}: ${m.content}`)
  )
  await notionRequest(`/blocks/${pageId}/children`, {
    method: "PATCH",
    body: JSON.stringify({ children: blocks }),
  })
}

interface BlockChildrenResponse {
  results: Array<{
    type: string
    paragraph?: { rich_text: Array<{ plain_text?: string }> }
  }>
  has_more: boolean
  next_cursor: string | null
}

/** 가장 최근 N개 exchange (user+assistant 합산 N message)를 archive에서 복원 */
export async function getRecentDakotaLog(
  limit = 30
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const row = await findMemoryRow()
  if (!row) return []

  let cursor: string | null = null
  let all: BlockChildrenResponse["results"] = []
  let safety = 0
  do {
    const url = cursor
      ? `/blocks/${row.pageId}/children?page_size=100&start_cursor=${cursor}`
      : `/blocks/${row.pageId}/children?page_size=100`
    const res: BlockChildrenResponse = await notionRequest<BlockChildrenResponse>(url)
    all = all.concat(res.results)
    cursor = res.has_more ? res.next_cursor : null
    safety++
  } while (cursor && safety < 20)

  const tail = all.slice(-limit)
  const parsed: Array<{ role: "user" | "assistant"; content: string }> = []
  for (const b of tail) {
    if (b.type !== "paragraph") continue
    const text = (b.paragraph?.rich_text ?? []).map((rt) => rt.plain_text ?? "").join("")
    const m = text.match(/^\[[^\]]+\]\s*(센터장|Dakota):\s*([\s\S]*)$/)
    if (!m) continue
    parsed.push({
      role: m[1] === "센터장" ? "user" : "assistant",
      content: m[2],
    })
  }
  return parsed
}

