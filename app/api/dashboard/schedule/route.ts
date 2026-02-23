import { NextResponse } from "next/server"
import { getUpcomingSchedules } from "@/lib/notion/schedule"
import { listGoogleCalendarEventsForDate } from "@/lib/google/calendar"

interface DashboardScheduleItem {
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

function todayInSeoul(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

function normalizeTitle(text: string): string {
  return text.trim().toLowerCase()
}

function isOnDay(dateValue: string | null, day: string): boolean {
  if (!dateValue) return false
  return dateValue.slice(0, 10) === day
}

function toMillis(dateValue: string): number {
  const value = Date.parse(dateValue)
  return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value
}

export async function GET() {
  try {
    const today = todayInSeoul()
    const [notionSchedules, gcalEvents] = await Promise.all([
      getUpcomingSchedules(1),
      listGoogleCalendarEventsForDate(today),
    ])

    const todayNotion = notionSchedules.filter((item) => isOnDay(item.date_start, today))
    const notionByTitle = new Map(todayNotion.map((item) => [normalizeTitle(item.name), item]))
    const usedNotionIds = new Set<string>()

    const merged: DashboardScheduleItem[] = []

    for (const event of gcalEvents) {
      if (!isOnDay(event.start, today)) {
        continue
      }

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

    for (const item of todayNotion) {
      if (usedNotionIds.has(item.page_id)) {
        continue
      }

      if (!item.date_start) {
        continue
      }

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

    return NextResponse.json(merged)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
