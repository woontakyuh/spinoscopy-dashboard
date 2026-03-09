import { NextResponse } from "next/server"
import { getOpCategoryOptions } from "@/lib/notion/analytics"

export async function GET() {
  try {
    const options = await getOpCategoryOptions()
    return NextResponse.json(options, {
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=600" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
