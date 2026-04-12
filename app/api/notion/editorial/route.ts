import { NextResponse } from "next/server"
import { listEditorialItems } from "@/lib/notion/editorial"

export async function GET() {
  try {
    const items = await listEditorialItems()
    return NextResponse.json(items)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
