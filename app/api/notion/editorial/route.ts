import { NextResponse } from "next/server"
import { listEditorialItems } from "@/lib/notion/editorial"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  try {
    const items = await listEditorialItems()
    return NextResponse.json(items, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
