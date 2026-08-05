import { notionRequest, notionEnv } from "./client"
import type { ScheduleCreateInput, ScheduleItem } from "../types/schedule"

interface NotionPage {
  id: string
  url: string
  properties: Record<string, NotionProperty>
}

interface NotionProperty {
  type: string
  title?: Array<{ plain_text?: string }>
  rich_text?: Array<{ plain_text?: string }>
  date?: { start: string; end: string | null } | null
  select?: { name: string } | null
  multi_select?: Array<{ name: string }>
  url?: string | null
  number?: number | null
  checkbox?: boolean
  people?: Array<{ name?: string }>
  formula?: { type: string; string?: string; number?: number; date?: { start: string } }
}

interface NotionQueryResponse {
  results: NotionPage[]
}

interface NotionCreatePageResponse {
  id: string
  url: string
}

function getText(prop: NotionProperty | undefined): string {
  if (!prop) return ""
  if (prop.type === "title") return (prop.title ?? []).map(t => t.plain_text ?? "").join("").trim()
  if (prop.type === "rich_text") return (prop.rich_text ?? []).map(t => t.plain_text ?? "").join("").trim()
  return ""
}

function getSelect(prop: NotionProperty | undefined): string {
  return prop?.select?.name ?? ""
}

function toScheduleItem(page: NotionPage): ScheduleItem {
  const p = page.properties
  const dateProp = p.Date
  return {
    page_id: page.id,
    url: page.url,
    name: getText(p.Name),
    date_start: dateProp?.type === "date" ? dateProp.date?.start ?? null : null,
    date_end: dateProp?.type === "date" ? dateProp.date?.end ?? null : null,
    place: getText(p.Place),
    category: p["분류"]?.multi_select?.map((s) => s.name).join(", ") ?? "",
    status: getSelect(p["준비 상태"]),
  }
}

function todaySeoul(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

function addDaysSeoul(days: number): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }))
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${dd}`
}

export async function getUpcomingSchedules(days = 7): Promise<ScheduleItem[]> {
  const dbId = notionEnv("NOTION_SCHEDULE_DB_ID")
  const todayStr = todaySeoul()
  const futureStr = addDaysSeoul(days)

  const response = await notionRequest<NotionQueryResponse>(
    `/databases/${dbId}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        filter: {
          and: [
            { property: "Date", date: { on_or_after: todayStr } },
            { property: "Date", date: { on_or_before: futureStr } },
          ],
        },
        sorts: [{ property: "Date", direction: "ascending" }],
        page_size: 20,
      }),
    }
  )

  return response.results.map(toScheduleItem)
}

/** 모든 컬럼 포함한 schedule 한 row를 flat record로 변환 (Dakota tool용) */
export interface ScheduleRich {
  page_id: string
  url: string
  [key: string]: string | number | boolean | string[] | null
}

function flattenProperty(prop: NotionProperty): string | number | boolean | string[] | null {
  if (!prop) return null
  switch (prop.type) {
    case "title":
      return (prop.title ?? []).map((t) => t.plain_text ?? "").join("").trim() || null
    case "rich_text":
      return (prop.rich_text ?? []).map((t) => t.plain_text ?? "").join("").trim() || null
    case "select":
      return prop.select?.name ?? null
    case "multi_select":
      return (prop.multi_select ?? []).map((s) => s.name)
    case "date":
      return prop.date?.start ?? null
    case "url":
      return prop.url ?? null
    case "number":
      return prop.number ?? null
    case "checkbox":
      return prop.checkbox ?? null
    case "people":
      return (prop.people ?? []).map((p) => p.name ?? "").filter(Boolean)
    case "formula":
      return prop.formula?.string ?? prop.formula?.number ?? prop.formula?.date?.start ?? null
    default:
      return null
  }
}

function toScheduleRich(page: NotionPage): ScheduleRich {
  const out: ScheduleRich = { page_id: page.id, url: page.url }
  for (const [key, val] of Object.entries(page.properties)) {
    out[key] = flattenProperty(val)
  }
  return out
}

export async function getSchedulesRichInRange(startDate: string, endDate: string, limit = 50): Promise<ScheduleRich[]> {
  const dbId = notionEnv("NOTION_SCHEDULE_DB_ID")
  const response = await notionRequest<NotionQueryResponse>(
    `/databases/${dbId}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        filter: {
          and: [
            { property: "Date", date: { on_or_after: startDate } },
            { property: "Date", date: { on_or_before: endDate } },
          ],
        },
        sorts: [{ property: "Date", direction: "ascending" }],
        page_size: Math.min(limit, 100),
      }),
    }
  )
  return response.results.map(toScheduleRich)
}

export async function getSchedulesInRange(startDate: string, endDate: string): Promise<ScheduleItem[]> {
  const dbId = notionEnv("NOTION_SCHEDULE_DB_ID")

  const response = await notionRequest<NotionQueryResponse>(
    `/databases/${dbId}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        filter: {
          and: [
            { property: "Date", date: { on_or_after: startDate } },
            { property: "Date", date: { on_or_before: endDate } },
          ],
        },
        sorts: [{ property: "Date", direction: "ascending" }],
        page_size: 100,
      }),
    }
  )

  return response.results.map(toScheduleItem)
}

export async function findDuplicateSchedule(name: string, dateStart: string): Promise<ScheduleItem | null> {
  const dbId = notionEnv("NOTION_SCHEDULE_DB_ID")

  const response = await notionRequest<NotionQueryResponse>(
    `/databases/${dbId}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        filter: {
          and: [
            { property: "Name", title: { equals: name } },
            { property: "Date", date: { equals: dateStart } },
          ],
        },
        page_size: 1,
      }),
    }
  )

  const page = response.results[0]
  return page ? toScheduleItem(page) : null
}

export async function createSchedule(input: ScheduleCreateInput): Promise<{ page_id: string; url: string }> {
  const dbId = notionEnv("NOTION_SCHEDULE_DB_ID")

  const properties: Record<string, unknown> = {
    Name: {
      title: [{ text: { content: input.name } }],
    },
    Date: {
      date: {
        start: input.date_start,
        end: input.date_end ?? null,
      },
    },
  }

  if (input.place) {
    properties.Place = {
      rich_text: [{ text: { content: input.place } }],
    }
  }

  if (input.category) {
    properties["분류"] = {
      multi_select: [{ name: input.category }],
    }
  }

  const society = (input.society ?? []).map((n) => n.trim()).filter((n) => n.length > 0)
  if (society.length > 0) {
    properties["학회명"] = {
      multi_select: society.map((name) => ({ name })),
    }
  }

  if (input.topic) {
    properties["발표 주제"] = {
      rich_text: [{ text: { content: input.topic } }],
    }
  }

  if (input.link) {
    properties.Link = { url: input.link }
  }

  const response = await notionRequest<NotionCreatePageResponse>("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties,
    }),
  })

  return { page_id: response.id, url: response.url }
}

export interface ScheduleUpdateInput {
  name?: string
  date_start?: string
  date_end?: string | null
  place?: string | null
  category?: string | null
  society?: string[]
  topic?: string | null
  link?: string | null
}

export async function updateSchedule(pageId: string, input: ScheduleUpdateInput): Promise<void> {
  const properties: Record<string, unknown> = {}

  if (input.name !== undefined) {
    properties.Name = { title: [{ text: { content: input.name } }] }
  }
  if (input.date_start !== undefined || input.date_end !== undefined) {
    properties.Date = {
      date: {
        start: input.date_start,
        end: input.date_end ?? null,
      },
    }
  }
  if (input.place !== undefined) {
    properties.Place = {
      rich_text: input.place ? [{ text: { content: input.place } }] : [],
    }
  }
  if (input.category !== undefined) {
    properties["분류"] = {
      multi_select: input.category ? [{ name: input.category }] : [],
    }
  }
  if (input.society !== undefined) {
    properties["학회명"] = {
      multi_select: input.society.map((name) => ({ name })),
    }
  }
  if (input.topic !== undefined) {
    properties["발표 주제"] = {
      rich_text: input.topic ? [{ text: { content: input.topic } }] : [],
    }
  }
  if (input.link !== undefined) {
    properties.Link = { url: input.link }
  }

  if (Object.keys(properties).length === 0) return

  await notionRequest(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  })
}

export async function deleteSchedule(pageId: string): Promise<void> {
  await notionRequest(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ archived: true }),
  })
}
