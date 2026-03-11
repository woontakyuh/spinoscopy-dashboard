import type { ScheduleItem } from "./types/schedule"
import type { GoogleCalendarEventSummary } from "./google/calendar"

export interface DashboardScheduleItem {
  id: string
  title: string
  start: string
  end: string | null
  location: string
  category: string
  source: "notion" | "gcal" | "both"
  notionUrl?: string
  gcalUrl?: string
}

function normalizeTitle(text: string): string {
  return text.trim().toLowerCase()
}

function toMillis(dateValue: string): number {
  const value = Date.parse(dateValue)
  return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value
}

export function mergeSchedules(
  notionSchedules: ScheduleItem[],
  gcalEvents: GoogleCalendarEventSummary[],
  filterFn: (dateValue: string | null) => boolean
): DashboardScheduleItem[] {
  const filteredNotion = notionSchedules.filter((item) => filterFn(item.date_start))
  const notionByTitle = new Map(filteredNotion.map((item) => [normalizeTitle(item.name), item]))
  const usedNotionIds = new Set<string>()
  const merged: DashboardScheduleItem[] = []

  for (const event of gcalEvents) {
    if (!filterFn(event.start)) continue

    const normalized = normalizeTitle(event.title)
    const matchedNotion = notionByTitle.get(normalized)

    if (matchedNotion) {
      usedNotionIds.add(matchedNotion.page_id)
      merged.push({
        id: matchedNotion.page_id,
        title: matchedNotion.name,
        start: matchedNotion.date_start ?? event.start,
        end: matchedNotion.date_end,
        location: matchedNotion.place,
        category: matchedNotion.category,
        source: "both",
        notionUrl: matchedNotion.url,
        gcalUrl: event.url,
      })
      continue
    }

    merged.push({
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      location: event.location,
      category: "",
      source: "gcal",
      gcalUrl: event.url,
    })
  }

  for (const item of filteredNotion) {
    if (usedNotionIds.has(item.page_id) || !item.date_start) continue
    merged.push({
      id: item.page_id,
      title: item.name,
      start: item.date_start,
      end: item.date_end,
      location: item.place,
      category: item.category,
      source: "notion",
      notionUrl: item.url,
    })
  }

  merged.sort((a, b) => toMillis(a.start) - toMillis(b.start))
  return merged
}
