import { NextResponse, type NextRequest } from "next/server"
import { getAllPatientRows } from "@/lib/notion/analytics"

export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get("categories") ?? undefined
    const categories = raw ? raw.split(",").map(s => s.trim()).filter(Boolean) : undefined
    const data = await getAllPatientRows(categories)
    return NextResponse.json(data, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
