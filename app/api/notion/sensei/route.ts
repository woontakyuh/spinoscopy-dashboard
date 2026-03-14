import { NextRequest, NextResponse } from "next/server"
import { createSenseiEntry, createPromotionEntry, fetchTagOptions, listSenseiEntries, findEntryByDate, appendToSenseiEntry } from "@/lib/notion/sensei"
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
  type?: "promotion"
  classInput?: string
  sparringInput?: string
  date?: string
  rawInput?: string
  instructor?: string
  note?: string
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

    // 승급식 처리
    if (body.type === "promotion") {
      if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
        return NextResponse.json({ error: "날짜를 입력해주세요" }, { status: 400 })
      }
      const pageId = await createPromotionEntry(body.date, body.note)
      return NextResponse.json({ success: true, pageId, structured: { title: `승급식 ${body.date}`, sessionType: "promotion", date: body.date } })
    }

    const rawInput = buildRawInput(body)
    if (!rawInput) {
      return NextResponse.json({ error: "입력 내용이 없습니다" }, { status: 400 })
    }

    const tags = await fetchTagOptions()
    const structured = await formatBjjNote(rawInput, tags)

    if (body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      structured.date = body.date
    }

    // 수업 내용 유무로 sessionType 결정: 수업 있으면 class, 수업 없이 스파링만 있으면 openmat
    const classText = (body.classInput ?? "").trim()
    const sparringText = (body.sparringInput ?? "").trim()
    if (classText) {
      structured.sessionType = "class"
    } else if (sparringText) {
      structured.sessionType = "openmat"
      // openmat: 수업 없이 스파링만 → 모든 태그를 sparringTags로 병합
      structured.sparringTags = [...new Set([...structured.sparringTags, ...structured.classTags])]
      structured.classTags = []
    }

    // instructor 오버라이드 (form에서 전달된 경우)
    if (body.instructor) {
      structured.instructor = body.instructor
    }

    // 같은 날짜에 기존 기록이 있으면 내용 추가, 없으면 새로 생성
    const existing = await findEntryByDate(structured.date)
    let pageId: string
    let appended = false

    if (existing && existing.entry.sessionType !== "promotion") {
      pageId = await appendToSenseiEntry(existing.page.id, existing.entry, structured, rawInput)
      // 병합된 태그를 structured에 반영하여 응답
      structured.classTags = Array.from(new Set([...existing.entry.classTags, ...structured.classTags]))
      structured.sparringTags = Array.from(new Set([...existing.entry.sparringTags, ...structured.sparringTags]))
      appended = true
    } else {
      pageId = await createSenseiEntry(structured, rawInput)
    }

    return NextResponse.json({ success: true, pageId, structured, appended })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
