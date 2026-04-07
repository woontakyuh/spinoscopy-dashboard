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
