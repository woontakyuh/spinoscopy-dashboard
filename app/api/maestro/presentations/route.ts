import { NextRequest, NextResponse } from "next/server"
import { getPresentations } from "@/lib/notion/maestro"
import type { PresentationFilter, TimeFilter, AttendanceFilter } from "@/lib/types/maestro"

const TIME_VALUES = new Set<TimeFilter>(["past", "upcoming"])
const ATTENDANCE_VALUES = new Set<AttendanceFilter>(["all", "참석", "불참", "발표", "미정"])
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const filter: PresentationFilter = {}
    const time = searchParams.get("time")
    if (time && TIME_VALUES.has(time as TimeFilter)) filter.time = time as TimeFilter

    const attendance = searchParams.get("attendance")
    if (attendance && ATTENDANCE_VALUES.has(attendance as AttendanceFilter))
      filter.attendance = attendance as AttendanceFilter
    const society = searchParams.get("society")
    if (society) filter.society = society
    const presentations = await getPresentations(filter)
    return NextResponse.json({ presentations })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 })
}

export async function PATCH() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 })
}

export async function DELETE() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 })
}
