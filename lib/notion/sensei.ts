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
  const sessionType = sessionTypeRaw === "openmat" ? "openmat" as const
    : sessionTypeRaw === "promotion" ? "promotion" as const
    : "class" as const
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

interface NotionDbSchema {
  properties: Record<string, {
    type: string
    multi_select?: { options: Array<{ name: string }> }
    select?: { options: Array<{ name: string }> }
  }>
}

export interface SenseiTagOptions {
  classTags: string[]
  sparringTags: string[]
  instructors: string[]
  gyms: string[]
}

export async function fetchTagOptions(): Promise<SenseiTagOptions> {
  const dbId = getDbId()
  const db = await notionRequest<NotionDbSchema>(`/databases/${dbId}`)
  return {
    classTags: (db.properties.Class?.multi_select?.options ?? []).map((o) => o.name),
    sparringTags: (db.properties.Sparring?.multi_select?.options ?? []).map((o) => o.name),
    instructors: (db.properties.Instructor?.select?.options ?? []).map((o) => o.name),
    gyms: (db.properties.Gym?.select?.options ?? []).map((o) => o.name),
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

async function ensureSessionTypeProperty(dbId: string): Promise<void> {
  const db = await notionRequest<{ properties: Record<string, { type: string }> }>(`/databases/${dbId}`)
  if (db.properties.SessionType) return

  await notionRequest(`/databases/${dbId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        SessionType: {
          select: {
            options: [
              { name: "class", color: "purple" },
              { name: "openmat", color: "green" },
              { name: "promotion", color: "yellow" },
            ],
          },
        },
      },
    }),
  })
}

let sessionTypEnsured = false

export async function findEntryByDate(date: string): Promise<{ page: NotionPage; entry: SenseiEntry } | null> {
  const dbId = getDbId()
  const response = await notionRequest<NotionQueryResponse>(`/databases/${dbId}/query`, {
    method: "POST",
    body: JSON.stringify({
      page_size: 1,
      filter: {
        property: "Date",
        date: { equals: date },
      },
    }),
  })

  if (response.results.length === 0) return null
  const page = response.results[0]
  return { page, entry: toEntry(page) }
}

export async function appendToSenseiEntry(
  pageId: string,
  existing: SenseiEntry,
  newInput: StructuredBjjNote,
  rawInput: string,
): Promise<string> {
  const mergedClassTags = Array.from(new Set([...existing.classTags, ...newInput.classTags]))
  const mergedSparringTags = Array.from(new Set([...existing.sparringTags, ...newInput.sparringTags]))

  const existingNote = existing.note || ""
  const newNote = summarizeForProperty(newInput.note)
  const mergedNote = existingNote
    ? `${existingNote}\n---\n${newNote}`
    : newNote

  await notionRequest(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        Class: { multi_select: mergedClassTags.map((name) => ({ name })) },
        Sparring: { multi_select: mergedSparringTags.map((name) => ({ name })) },
        Note: { rich_text: [{ text: { content: mergedNote.slice(0, 2000) } }] },
      },
    }),
  })

  const newBlocks: NotionBlock[] = [
    {
      object: "block",
      type: "heading_2",
      heading_2: { rich_text: buildRichText("추가 수련 기록") },
    },
  ]

  for (const line of splitParagraphs(newInput.note)) {
    const content = toBullet(line)
    if (!content) continue
    newBlocks.push({
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: { rich_text: buildRichText(content) },
    })
  }

  newBlocks.push(
    {
      object: "block",
      type: "heading_2",
      heading_2: { rich_text: buildRichText("추가 원문 메모") },
    },
    {
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: buildRichText(rawInput || "(원문 없음)") },
    }
  )

  await notionRequest(`/blocks/${pageId}/children`, {
    method: "PATCH",
    body: JSON.stringify({ children: newBlocks }),
  })

  return pageId
}

export async function createSenseiEntry(input: StructuredBjjNote, rawInput: string): Promise<string> {
  const dbId = getDbId()

  if (!sessionTypEnsured) {
    await ensureSessionTypeProperty(dbId)
    sessionTypEnsured = true
  }

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

export async function createPromotionEntry(date: string, note?: string): Promise<string> {
  const dbId = getDbId()

  if (!sessionTypEnsured) {
    await ensureSessionTypeProperty(dbId)
    sessionTypEnsured = true
  }

  const title = `승급식 ${date}`
  const response = await notionRequest<NotionCreateResponse>("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: {
        Name: { title: [{ text: { content: title } }] },
        SessionType: { select: { name: "promotion" } },
        Date: { date: { start: date } },
        ...(note ? { Note: { rich_text: [{ text: { content: note.slice(0, 280) } }] } } : {}),
      },
      ...(note ? {
        children: [
          {
            object: "block",
            type: "paragraph",
            paragraph: { rich_text: buildRichText(note) },
          },
        ],
      } : {}),
    }),
  })

  return response.id
}
