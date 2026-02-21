import { NextRequest, NextResponse } from "next/server"
import { createSenseiEntry, listSenseiEntries } from "@/lib/notion/sensei"
import { formatBjjNote } from "@/lib/ai/formatBjjNote"

export async function GET() {
  try {
    const entries = await listSenseiEntries()
    return NextResponse.json(entries)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { rawInput?: string }
    const rawInput = (body.rawInput ?? "").trim()
    if (!rawInput) {
      return NextResponse.json({ error: "rawInput required" }, { status: 400 })
    }

    const structured = await formatBjjNote(rawInput)
    const pageId = await createSenseiEntry(structured, rawInput)

    return NextResponse.json({ success: true, pageId, structured })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
