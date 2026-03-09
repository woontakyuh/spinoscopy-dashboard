import { NextResponse } from "next/server"
import { getAllDimensionOptions } from "@/lib/notion/analytics"

export async function GET() {
  try {
    const schema = await getAllDimensionOptions()
    return NextResponse.json(schema, {
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=600" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
