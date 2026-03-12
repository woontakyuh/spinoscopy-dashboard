import { NextRequest, NextResponse } from "next/server"
import { getUpcomingSchedules } from "@/lib/notion/schedule"
import {
  listGoogleCalendarEventsForDate,
  listGoogleCalendarEventsForRange,
} from "@/lib/google/calendar"
import { mergeSchedules } from "@/lib/schedule-merge"

export const dynamic = "force-dynamic"

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

function isOnDay(dateValue: string | null, day: string): boolean {
  if (!dateValue) return false
  return dateValue.slice(0, 10) === day
}

function isAfterDay(dateValue: string | null, day: string): boolean {
  if (!dateValue) return false
  return dateValue.slice(0, 10) > day
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
