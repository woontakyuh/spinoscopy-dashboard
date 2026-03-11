import { notionRequest } from "./client"
import type { Presentation, PresentationFilter } from "@/lib/types/presentation"

interface NotionProperty {
  type: string
  title?: Array<{ plain_text?: string }>
  rich_text?: Array<{ plain_text?: string }>
  date?: { start: string; end: string | null } | null
  select?: { name: string } | null
  multi_select?: Array<{ name: string }>
  url?: string | null
}

interface NotionPage {
  id: string
  url: string
  properties: Record<string, NotionProperty>
}

interface NotionQueryResponse {
  results: NotionPage[]
}

function getText(prop: NotionProperty | undefined): string {
  if (!prop) return ""
  if (prop.type === "title") return (prop.title ?? []).map((v) => v.plain_text ?? "").join("").trim()
  if (prop.type === "rich_text") return (prop.rich_text ?? []).map((v) => v.plain_text ?? "").join("").trim()
  return ""
}

function getMultiSelect(prop: NotionProperty | undefined): string[] {
  return (prop?.multi_select ?? []).map((v) => v.name)
}

function getScheduleDbId(): string {
  return process.env.NOTION_SCHEDULE_DB_ID ?? ""
}

export function toPresentation(page: NotionPage): Presentation {
  const p = page.properties
  return {
    page_id: page.id,
    url: page.url,
    name: getText(p.Name),
    date_start: p.Date?.date?.start ?? null,
    date_end: p.Date?.date?.end ?? null,
    place: getText(p.Place),
    category: p["분류"]?.select?.name ?? "",
    society: getMultiSelect(p["학회명"]),
    topic: getText(p["발표 주제"]),
    preparation_status: "",
    attendance_type: p["참석"]?.select?.name ?? "",
    link: p.Link?.url ?? null,
    abstract_deadline: p["\b초록 제출 기한"]?.date?.start ?? null,
  }
}

function buildFilter(filter?: PresentationFilter) {
  const conditions: Record<string, unknown>[] = []
  const attendance = filter?.attendance ?? "all"
  if (attendance === "발표") {
    conditions.push({
      or: ["발표예정", "준비 완료"].map((val) => ({
        property: "참석",
        select: { equals: val },
      })),
    })
  } else if (attendance === "참석") {
    conditions.push({ property: "참석", select: { equals: "참석만" } })
  } else if (attendance === "불참") {
    conditions.push({ property: "참석", select: { equals: "불참" } })
  } else if (attendance === "미정") {
    conditions.push({ property: "참석", select: { is_empty: true } })
  }
  if (filter?.society) {
    conditions.push({
      property: "학회명",
      multi_select: { contains: filter.society },
    })
  }

  const time = filter?.time ?? "upcoming"
  const today = new Date().toISOString().slice(0, 10)
  if (time === "upcoming") {
    conditions.push({ property: "Date", date: { on_or_after: today } })
  } else if (time === "past") {
    conditions.push({ property: "Date", date: { before: today } })
  }

  if (conditions.length === 0) return undefined
  if (conditions.length === 1) return conditions[0]
  return { and: conditions }
}

function getSortDirection(filter?: PresentationFilter): "ascending" | "descending" {
  return filter?.time === "past" ? "descending" : "ascending"
}
export async function getPresentations(filter?: PresentationFilter): Promise<Presentation[]> {
  const dbId = getScheduleDbId()
  if (!dbId) throw new Error("NOTION_SCHEDULE_DB_ID is not set")
  const body: Record<string, unknown> = {
    page_size: 100,
    sorts: [{ property: "Date", direction: getSortDirection(filter) }],
  }
  const f = buildFilter(filter)
  if (f) body.filter = f
  const response = await notionRequest<NotionQueryResponse>(`/databases/${dbId}/query`, {
    method: "POST",
    body: JSON.stringify(body),
  })
  return response.results.map(toPresentation)
}
