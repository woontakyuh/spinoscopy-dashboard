import { notionRequest } from "./client"
import type { SenseiEntry, StructuredBjjNote } from "@/lib/types/sensei"

interface NotionProperty {
  type: string
  title?: Array<{ plain_text?: string }>
  rich_text?: Array<{ plain_text?: string }>
  date?: { start: string; end: string | null } | null
  select?: { name: string } | null
  multi_select?: Array<{ name: string }>
}

interface NotionPage {
  id: string
  url: string
  properties: Record<string, NotionProperty>
}

interface NotionQueryResponse {
  results: NotionPage[]
}

interface NotionCreateResponse {
  id: string
}

function getText(prop: NotionProperty | undefined): string {
  if (!prop) return ""
  if (prop.type === "title") return (prop.title ?? []).map((v) => v.plain_text ?? "").join("").trim()
  if (prop.type === "rich_text") return (prop.rich_text ?? []).map((v) => v.plain_text ?? "").join("").trim()
  return ""
}

function getMulti(prop: NotionProperty | undefined): string[] {
  return (prop?.multi_select ?? []).map((v) => v.name)
}

function getDbId() {
  return process.env.NOTION_BJJ_DB_ID ?? "2e7908af25b980978098c857bdc0acbe"
}

function toEntry(page: NotionPage): SenseiEntry {
  const p = page.properties
  return {
    id: page.id,
    title: getText(p.Name),
    date: p.Date?.date?.start ?? null,
    instructor: p.Instructor?.select?.name ?? "",
    gym: p.Gym?.select?.name ?? "",
    classTags: getMulti(p.Class),
    sparringTags: getMulti(p.Sparring),
    note: getText(p.Note),
    url: page.url,
  }
}

export async function listSenseiEntries(): Promise<SenseiEntry[]> {
  const dbId = getDbId()
  const response = await notionRequest<NotionQueryResponse>(`/databases/${dbId}/query`, {
    method: "POST",
    body: JSON.stringify({
      page_size: 20,
      sorts: [{ property: "Date", direction: "descending" }],
    }),
  })

  return response.results.map(toEntry)
}

export async function createSenseiEntry(input: StructuredBjjNote): Promise<string> {
  const dbId = getDbId()
  const response = await notionRequest<NotionCreateResponse>("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: {
        Name: { title: [{ text: { content: input.title } }] },
        Date: { date: { start: input.date } },
        Instructor: { select: { name: input.instructor } },
        Gym: { select: { name: input.gym } },
        Class: { multi_select: input.classTags.map((name) => ({ name })) },
        Sparring: { multi_select: input.sparringTags.map((name) => ({ name })) },
        Note: { rich_text: [{ text: { content: input.note } }] },
      },
    }),
  })

  return response.id
}
