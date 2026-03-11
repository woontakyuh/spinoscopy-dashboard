import { NextRequest, NextResponse } from "next/server"
import { getSchedulesInRange } from "@/lib/notion/schedule"
import { listGoogleCalendarEventsForRange } from "@/lib/google/calendar"
import { mergeSchedules } from "@/lib/schedule-merge"

function parseMonth(month: string): { startDate: string; endDate: string } | null {
  const match = /^(\d{4})-(\d{2})$/u.exec(month)
  if (!match) return null

  const year = Number(match[1])
  const mon = Number(match[2])
  if (mon < 1 || mon > 12) return null

  const startDate = `${year}-${String(mon).padStart(2, "0")}-01`
  const lastDay = new Date(year, mon, 0).getDate()
  const endDate = `${year}-${String(mon).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
  return { startDate, endDate }
}

export async function GET(req: NextRequest) {
  try {
    const month = req.nextUrl.searchParams.get("month")
    if (!month) {
      return NextResponse.json({ error: "month parameter required (e.g. 2026-03)" }, { status: 400 })
    }

    const range = parseMonth(month)
    if (!range) {
      return NextResponse.json({ error: "Invalid month format. Use YYYY-MM" }, { status: 400 })
    }

    const [notionSchedules, gcalEvents] = await Promise.all([
      getSchedulesInRange(range.startDate, range.endDate),
      listGoogleCalendarEventsForRange(range.startDate, range.endDate),
    ])

    const merged = mergeSchedules(notionSchedules, gcalEvents, () => true)
    return NextResponse.json(merged)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
