import { notionRequest } from "./client"
import type { ScheduleItem } from "../types/schedule"

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
}

interface NotionQueryResponse {
  results: NotionPage[]
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
    category: getSelect(p["분류"]),
    status: getSelect(p["준비 상태"]),
  }
}

export async function getUpcomingSchedules(days = 7): Promise<ScheduleItem[]> {
  const dbId = process.env.NOTION_SCHEDULE_DB_ID
  const today = new Date()
  const future = new Date(today)
  future.setDate(today.getDate() + days)

  const toDate = (d: Date) => d.toISOString().slice(0, 10)

  const response = await notionRequest<NotionQueryResponse>(
    `/databases/${dbId}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        filter: {
          and: [
            { property: "Date", date: { on_or_after: toDate(today) } },
            { property: "Date", date: { on_or_before: toDate(future) } },
          ],
        },
        sorts: [{ property: "Date", direction: "ascending" }],
        page_size: 20,
      }),
    }
  )

  return response.results.map(toScheduleItem)
}
