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

type RichTextItem = {
  type: "text"
  text: {
    content: string
  }
}

type NotionBlock = {
  object: "block"
  type: "heading_2" | "paragraph" | "bulleted_list_item"
  heading_2?: { rich_text: RichTextItem[] }
  paragraph?: { rich_text: RichTextItem[] }
  bulleted_list_item?: { rich_text: RichTextItem[] }
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

function buildRichText(content: string): RichTextItem[] {
  return [{ type: "text", text: { content: content.slice(0, 1800) } }]
}

function splitParagraphs(note: string): string[] {
  return note
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (line.length > 1800 ? line.slice(0, 1800) : line))
}

function toBullet(line: string): string {
  if (line.startsWith("- ")) return line.slice(2).trim()
  if (line.startsWith("* ")) return line.slice(2).trim()
  return line
}

function buildPageBlocks(input: StructuredBjjNote, rawInput: string): NotionBlock[] {
  const blocks: NotionBlock[] = [
    {
      object: "block",
      type: "heading_2",
      heading_2: { rich_text: buildRichText("수련 요약") },
    },
  ]

  for (const line of splitParagraphs(input.note)) {
    const content = toBullet(line)
    if (!content) continue
    blocks.push({
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: { rich_text: buildRichText(content) },
    })
  }

  blocks.push(
    {
      object: "block",
      type: "heading_2",
      heading_2: { rich_text: buildRichText("원문 메모") },
    },
    {
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: buildRichText(rawInput || "(원문 없음)") },
    }
  )

  return blocks
}

function summarizeForProperty(note: string): string {
  const first = splitParagraphs(note)[0] ?? note
  return first.slice(0, 280)
}

function toEntry(page: NotionPage): SenseiEntry {
  const p = page.properties
  const sessionTypeRaw = p.SessionType?.select?.name
  const sessionType = sessionTypeRaw === "openmat" ? "openmat" as const : "class" as const
  return {
    id: page.id,
    title: getText(p.Name),
    sessionType,
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

export async function createSenseiEntry(input: StructuredBjjNote, rawInput: string): Promise<string> {
  const dbId = getDbId()
  const response = await notionRequest<NotionCreateResponse>("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: {
        Name: { title: [{ text: { content: input.title } }] },
        SessionType: { select: { name: input.sessionType } },
        Date: { date: { start: input.date } },
        Instructor: { select: { name: input.instructor } },
        Gym: { select: { name: input.gym } },
        Class: { multi_select: input.classTags.map((name) => ({ name })) },
        Sparring: { multi_select: input.sparringTags.map((name) => ({ name })) },
        Note: { rich_text: [{ text: { content: summarizeForProperty(input.note) } }] },
      },
      children: buildPageBlocks(input, rawInput),
    }),
  })

  return response.id
}
