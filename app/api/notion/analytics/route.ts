import { NextResponse } from "next/server"
import { getAllPatientRows } from "@/lib/notion/analytics"

export async function GET() {
  try {
    const data = await getAllPatientRows()
    return NextResponse.json(data, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
