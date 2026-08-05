import { notionRequest } from "./client"
import {
  LO_MEMORY_CATEGORIES,
  LO_MEMORY_DB_ID_ENV,
  LO_MEMORY_SOURCE_KINDS,
  LO_MEMORY_STATUSES,
  type LoMemory,
  type LoMemoryCategory,
  type LoMemoryCreateInput,
  type LoMemoryQuery,
  type LoMemorySourceKind,
  type LoMemoryStatus,
  type LoMemorySupersedeInput,
} from "@/lib/types/lo-v2"

interface NotionRichText {
  plain_text?: string
}

interface NotionProperty {
  type: string
  title?: NotionRichText[]
  rich_text?: NotionRichText[]
  select?: { name: string } | null
  number?: number | null
  date?: { start: string } | null
}

interface NotionPage {
  id: string
  url: string
  created_time: string
  last_edited_time: string
  properties: Record<string, NotionProperty>
}

interface NotionQueryResponse {
  results: NotionPage[]
  has_more: boolean
  next_cursor: string | null
}

function getText(property: NotionProperty | undefined): string | null {
  if (property?.type === "title") return (property.title ?? []).map((part) => part.plain_text ?? "").join("").trim() || null
  if (property?.type === "rich_text") return (property.rich_text ?? []).map((part) => part.plain_text ?? "").join("").trim() || null
  return null
}

function getSelect(property: NotionProperty | undefined): string | null {
  return property?.type === "select" ? property.select?.name ?? null : null
}

function getDate(property: NotionProperty | undefined): string | null {
  return property?.type === "date" ? property.date?.start ?? null : null
}

function isMemoryCategory(value: string | null): value is LoMemoryCategory {
  return value !== null && (LO_MEMORY_CATEGORIES as readonly string[]).includes(value)
}

function isMemoryStatus(value: string | null): value is LoMemoryStatus {
  return value !== null && (LO_MEMORY_STATUSES as readonly string[]).includes(value)
}

function isMemorySourceKind(value: string | null): value is LoMemorySourceKind {
  return value !== null && (LO_MEMORY_SOURCE_KINDS as readonly string[]).includes(value)
}

function toLoMemory(page: NotionPage): LoMemory {
  const properties = page.properties
  const category = getSelect(properties.Category)
  const status = getSelect(properties.Status)
  const sourceKind = getSelect(properties["Source Type"])

  return {
    pageId: page.id,
    url: page.url,
    name: getText(properties.Name) ?? "",
    content: getText(properties.Content) ?? "",
    category: isMemoryCategory(category) ? category : null,
    status: isMemoryStatus(status) ? status : null,
    importance: properties.Importance?.type === "number" ? properties.Importance.number ?? null : null,
    source: {
      kind: isMemorySourceKind(sourceKind) ? sourceKind : null,
      reference: getText(properties["Source Reference"]),
      capturedAt: getDate(properties["Source Captured At"]),
    },
    supersedes: getText(properties.Supersedes),
    supersededBy: getText(properties["Superseded By"]),
    supersededAt: getDate(properties["Superseded At"]),
    createdAt: page.created_time,
    lastEditedAt: page.last_edited_time,
  }
}

function richText(content: string): Array<{ text: { content: string } }> {
  return content ? [{ text: { content } }] : []
}

function assertNotionText(field: string, value: string): void {
  if (!value.trim()) throw new Error(`${field} must not be empty`)
  if (value.length > 2_000) throw new Error(`${field} exceeds Notion's 2000 character limit`)
}

function normalizedImportance(value: number | undefined): number {
  const importance = value ?? 3
  if (!Number.isInteger(importance) || importance < 1 || importance > 5) {
    throw new Error("importance must be an integer from 1 to 5")
  }
  return importance
}

function memoryProperties(input: LoMemoryCreateInput): Record<string, unknown> {
  assertNotionText("name", input.name)
  assertNotionText("content", input.content)
  assertNotionText("source.reference", input.source.reference)
  assertNotionText("source.capturedAt", input.source.capturedAt)

  return {
    Name: { title: richText(input.name) },
    Content: { rich_text: richText(input.content) },
    Category: { select: { name: input.category } },
    Status: { select: { name: "active" } },
    Importance: { number: normalizedImportance(input.importance) },
    "Source Type": { select: { name: input.source.kind } },
    "Source Reference": { rich_text: richText(input.source.reference) },
    "Source Captured At": { date: { start: input.source.capturedAt } },
  }
}

export function getLoMemoryDbId(): string {
  const databaseId = process.env[LO_MEMORY_DB_ID_ENV]?.trim()
  if (!databaseId) throw new Error(`${LO_MEMORY_DB_ID_ENV} is not configured`)
  return databaseId
}

function filterFor(options: LoMemoryQuery): Record<string, unknown> | undefined {
  const filters: Array<Record<string, unknown>> = []
  const status = options.status ?? "active"
  if (status !== "all") filters.push({ property: "Status", select: { equals: status } })
  if (options.category) filters.push({ property: "Category", select: { equals: options.category } })
  if (options.sourceKind) filters.push({ property: "Source Type", select: { equals: options.sourceKind } })
  if (options.sourceReference) filters.push({ property: "Source Reference", rich_text: { contains: options.sourceReference } })
  if (options.minImportance !== undefined) {
    if (!Number.isInteger(options.minImportance) || options.minImportance < 1 || options.minImportance > 5) {
      throw new Error("minImportance must be an integer from 1 to 5")
    }
    filters.push({ property: "Importance", number: { greater_than_or_equal_to: options.minImportance } })
  }
  if (filters.length === 0) return undefined
  return filters.length === 1 ? filters[0] : { and: filters }
}

/**
 * Lists only active memories by default. A caller must explicitly request
 * superseded rows, which prevents obsolete facts from returning to prompts.
 */
export async function listLoMemories(options: LoMemoryQuery = {}): Promise<LoMemory[]> {
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error("limit must be a positive integer")
  }

  const databaseId = getLoMemoryDbId()
  const filter = filterFor(options)
  const memories: LoMemory[] = []
  let cursor: string | null = null

  do {
    const remaining = options.limit === undefined ? 100 : Math.min(100, options.limit - memories.length)
    if (remaining <= 0) break
    const body: Record<string, unknown> = {
      page_size: remaining,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      ...(cursor ? { start_cursor: cursor } : {}),
    }
    if (filter) body.filter = filter

    const response = await notionRequest<NotionQueryResponse>(`/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    })
    memories.push(...response.results.map(toLoMemory))
    if (!response.has_more) {
      cursor = null
    } else if (!response.next_cursor) {
      throw new Error("Notion pagination error: has_more=true but next_cursor is missing (Lo Memory)")
    } else {
      cursor = response.next_cursor
    }
  } while (cursor)

  return options.limit === undefined ? memories : memories.slice(0, options.limit)
}

/** Creates one distilled fact. Conversation transcripts are deliberately not accepted or stored. */
export async function createLoMemory(input: LoMemoryCreateInput): Promise<LoMemory> {
  const databaseId = getLoMemoryDbId()
  const response = await notionRequest<NotionPage>("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: memoryProperties(input),
    }),
  })
  return toLoMemory(response)
}

/**
 * Replaces a durable fact while retaining a bidirectional audit trail. The
 * successor remains active; the previous fact becomes superseded and points
 * to it. There is intentionally no generic status mutation API.
 */
export async function supersedeLoMemory(input: LoMemorySupersedeInput): Promise<LoMemory> {
  assertNotionText("pageId", input.pageId)
  assertNotionText("supersededAt", input.supersededAt)

  const successor = await createLoMemory(input.replacement)
  await notionRequest(`/pages/${successor.pageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        Supersedes: { rich_text: richText(input.pageId) },
      },
    }),
  })
  await notionRequest(`/pages/${input.pageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        Status: { select: { name: "superseded" } },
        "Superseded By": { rich_text: richText(successor.pageId) },
        "Superseded At": { date: { start: input.supersededAt } },
      },
    }),
  })
  return successor
}
