import { NextRequest, NextResponse } from "next/server"
import { getUpcomingSchedules } from "@/lib/notion/schedule"
import {
  listGoogleCalendarEventsForDate,
  listGoogleCalendarEventsForRange,
} from "@/lib/google/calendar"

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

function addDaysSeoul(days: number): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }))
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${dd}`
}

function normalizeTitle(text: string): string {
  return text.trim().toLowerCase()
}

function isOnDay(dateValue: string | null, day: string): boolean {
  if (!dateValue) return false
  return dateValue.slice(0, 10) === day
}

function isAfterDay(dateValue: string | null, day: string): boolean {
  if (!dateValue) return false
  return dateValue.slice(0, 10) > day
}

function toMillis(dateValue: string): number {
  const value = Date.parse(dateValue)
  return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value
}

function mergeSchedules(
  notionSchedules: Awaited<ReturnType<typeof getUpcomingSchedules>>,
  gcalEvents: Awaited<ReturnType<typeof listGoogleCalendarEventsForDate>>,
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

export async function GET(req: NextRequest) {
  try {
    const upcoming = req.nextUrl.searchParams.get("upcoming") === "true"
    const today = todayInSeoul()

    if (upcoming) {
      const tomorrow = addDaysSeoul(1)
      const futureEnd = addDaysSeoul(14)
      const [notionSchedules, gcalEvents] = await Promise.all([
        getUpcomingSchedules(14),
        listGoogleCalendarEventsForRange(tomorrow, futureEnd),
      ])

      const merged = mergeSchedules(
        notionSchedules,
        gcalEvents,
        (dateValue) => isAfterDay(dateValue, today)
      )

      return NextResponse.json(merged.slice(0, 1))
    }

    const [notionSchedules, gcalEvents] = await Promise.all([
      getUpcomingSchedules(1),
      listGoogleCalendarEventsForDate(today),
    ])

    const merged = mergeSchedules(
      notionSchedules,
      gcalEvents,
      (dateValue) => isOnDay(dateValue, today)
    )

    return NextResponse.json(merged)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
