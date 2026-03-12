import { NextResponse } from "next/server"
import { getAuthorizedClient } from "@/lib/google/calendar"
import { google } from "googleapis"

export async function GET() {
  try {
    const auth = await getAuthorizedClient()
    if (!auth) {
      return NextResponse.json({ calendars: [] })
    }

    const calendar = google.calendar({ version: "v3", auth })
    const res = await calendar.calendarList.list()
    const items = (res.data.items ?? [])
      .filter((cal) => cal.id && cal.accessRole === "owner")
      .map((cal) => ({
        id: cal.id!,
        summary: cal.summary ?? cal.id!,
        primary: cal.primary ?? false,
      }))

    return NextResponse.json({ calendars: items })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message, calendars: [] }, { status: 500 })
  }
}
