import { NextResponse, type NextRequest } from "next/server"
import { getAllPatientRows, type Dimension, type DimensionFilters } from "@/lib/notion/analytics"

const VALID_DIMS: Dimension[] = ["op_category", "class_a", "class_b", "surgeon", "hospital"]

export async function GET(req: NextRequest) {
  try {
    const filters: DimensionFilters = {}
    for (const dim of VALID_DIMS) {
      const raw = req.nextUrl.searchParams.get(dim)
      if (raw) {
        const values = raw.split(",").map(s => s.trim()).filter(Boolean)
        if (values.length > 0) filters[dim] = values
      }
    }

    const data = await getAllPatientRows(Object.keys(filters).length > 0 ? filters : undefined)
    return NextResponse.json(data, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
