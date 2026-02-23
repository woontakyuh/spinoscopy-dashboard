import { NextResponse } from "next/server"
import { listGoogleCalendarEventsForDate } from "@/lib/google/calendar"

function getTodayInSeoul(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

export async function GET() {
  try {
    const today = getTodayInSeoul()
    const events = await listGoogleCalendarEventsForDate(today)
    return NextResponse.json(events)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
