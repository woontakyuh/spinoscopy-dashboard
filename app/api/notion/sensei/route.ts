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

interface SenseiPostBody {
  classInput?: string
  sparringInput?: string
  date?: string
  rawInput?: string
}

function buildRawInput(body: SenseiPostBody): string {
  const classText = (body.classInput ?? "").trim()
  const sparringText = (body.sparringInput ?? "").trim()

  if (classText || sparringText) {
    const parts: string[] = []
    if (classText) parts.push(`[수업] ${classText}`)
    if (sparringText) parts.push(`[스파링] ${sparringText}`)
    return parts.join("\n\n")
  }

  return (body.rawInput ?? "").trim()
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SenseiPostBody
    const rawInput = buildRawInput(body)
    if (!rawInput) {
      return NextResponse.json({ error: "입력 내용이 없습니다" }, { status: 400 })
    }

    const structured = await formatBjjNote(rawInput)

    if (body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      structured.date = body.date
    }

    const pageId = await createSenseiEntry(structured, rawInput)

    return NextResponse.json({ success: true, pageId, structured })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
