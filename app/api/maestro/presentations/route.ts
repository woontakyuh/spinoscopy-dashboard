import { NextRequest, NextResponse } from "next/server"
import { getPresentations } from "@/lib/notion/maestro"
import type { PresentationFilter } from "@/lib/types/maestro"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const filter: PresentationFilter = {}

    const society = searchParams.get("society")
    if (society) filter.society = society


    const upcomingOnly = searchParams.get("upcoming_only")
    if (upcomingOnly === "true") filter.upcoming_only = true

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
