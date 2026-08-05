import { notionRequest, notionEnv } from "./client"
import type { MemoCategory, MemoDraft } from "@/lib/types/draft"

interface NotionProperty {
  type: string
  title?: Array<{ plain_text?: string }>
  rich_text?: Array<{ plain_text?: string }>
  select?: { name: string } | null
}

interface NotionPage {
  id: string
  created_time: string
  properties: Record<string, NotionProperty>
}

interface NotionQueryResponse {
  results: NotionPage[]
}

interface NotionCreateResponse {
  id: string
  created_time: string
  properties: Record<string, NotionProperty>
}

function getText(prop: NotionProperty | undefined): string {
  if (!prop) return ""
  if (prop.type === "title") {
    return (prop.title ?? []).map((v) => v.plain_text ?? "").join("").trim()
  }
  if (prop.type === "rich_text") {
    return (prop.rich_text ?? []).map((v) => v.plain_text ?? "").join("").trim()
  }
  return ""
}

function normalizeCategory(name?: string): MemoCategory {
  if (name === "research") return "research"
  if (name === "idea") return "idea"
  return "patient"
}

function toDraft(page: NotionPage): MemoDraft {
  const p = page.properties
  return {
    id: page.id,
    title: getText(p.Title),
    rawInput: getText(p.RawInput),
    markdown: getText(p.Markdown),
    category: normalizeCategory(p.Category?.select?.name),
    createdAt: page.created_time,
  }
}

function toRichText(content: string) {
  const value = content.trim()
  if (!value) {
    return [{ text: { content: "" } }]
  }

  const chunks: Array<{ text: { content: string } }> = []
  const maxChunk = 1800

  for (let i = 0; i < value.length; i += maxChunk) {
    chunks.push({
      text: {
        content: value.slice(i, i + maxChunk),
      },
    })
  }

  return chunks
}

function getDraftsDbId() {
  const dbId = notionEnv("NOTION_DRAFTS_DB_ID")
  if (!dbId) {
    throw new Error("NOTION_DRAFTS_DB_ID missing")
  }
  return dbId
}

export async function listDrafts(): Promise<MemoDraft[]> {
  const dbId = getDraftsDbId()
  const response = await notionRequest<NotionQueryResponse>(`/databases/${dbId}/query`, {
    method: "POST",
    body: JSON.stringify({
      page_size: 100,
      filter: {
        property: "Status",
        select: { equals: "draft" },
      },
      sorts: [{ timestamp: "created_time", direction: "descending" }],
    }),
  })

  return response.results.map(toDraft)
}

export async function createDraft(params: {
  title: string
  rawInput: string
  markdown: string
  category: MemoCategory
}): Promise<MemoDraft> {
  const dbId = getDraftsDbId()

  const response = await notionRequest<NotionCreateResponse>("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: {
        Title: {
          title: [{ text: { content: params.title.slice(0, 120) } }],
        },
        RawInput: {
          rich_text: toRichText(params.rawInput),
        },
        Markdown: {
          rich_text: toRichText(params.markdown),
        },
        Status: {
          select: { name: "draft" },
        },
        Category: {
          select: { name: params.category },
        },
      },
    }),
  })

  return toDraft({
    id: response.id,
    created_time: response.created_time,
    properties: response.properties,
  })
}

export async function confirmDraft(pageId: string): Promise<void> {
  await notionRequest(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        Status: {
          select: { name: "confirmed" },
        },
      },
    }),
  })
}

export async function deleteDraft(pageId: string): Promise<void> {
  await notionRequest(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      archived: true,
    }),
  })
}
