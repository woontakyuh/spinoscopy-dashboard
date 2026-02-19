import { NextRequest, NextResponse } from "next/server"
import { getAnalytics, type GroupBy } from "@/lib/notion/analytics"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const raw = searchParams.get("groupBy") ?? "op_category"
  const groupBy = (["op_category", "class_a", "class_b"].includes(raw) ? raw : "op_category") as GroupBy

  try {
    const data = await getAnalytics(groupBy)
    return NextResponse.json(data, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
