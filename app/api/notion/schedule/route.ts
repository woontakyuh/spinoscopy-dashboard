import { NextResponse } from "next/server"
import { getUpcomingSchedules } from "@/lib/notion/schedule"

export async function GET() {
  try {
    const schedules = await getUpcomingSchedules(7)
    return NextResponse.json(schedules)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
