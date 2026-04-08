// 채팅 세션 1건을 통째로 Notion Dakota Memory DB에 한 row로 저장
// (focus 모드 진입 ~ 종료까지의 대화)

import { NextRequest, NextResponse } from "next/server"
import { createMemory } from "@/lib/notion/dakotaMemoryV2"

interface Exchange {
  role: "user" | "assistant"
  content: string
}

interface SessionBody {
  startTime: string  // ISO
  endTime: string    // ISO
  channel?: string   // "dashboard" / "desktop" 등
  exchanges: Exchange[]
}

function fmtKoreaTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  } catch {
    return iso
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SessionBody
    const exchanges = body.exchanges ?? []
    if (exchanges.length === 0) {
      return NextResponse.json({ skipped: true, reason: "no exchanges" })
    }

    const start = fmtKoreaTime(body.startTime)
    const end = fmtKoreaTime(body.endTime)
    const channel = body.channel ?? "dashboard"

    const transcript = exchanges
      .map((m) => `${m.role === "user" ? "센터장" : "Dakota"}: ${m.content}`)
      .join("\n\n")

    // Notion rich_text 1900자 제한 — 넘으면 잘라냄 (TODO: 분할 저장)
    const trimmed = transcript.length > 1850
      ? transcript.slice(0, 1850) + "…(truncated)"
      : transcript

    const row = await createMemory({
      name: `[chat ${channel}] ${start.slice(6)}-${end.slice(12)}`.slice(0, 200),
      category: "fact",
      content: trimmed,
      importance: 1, // 디지스트엔 안 들어감, search_memory로만 검색됨
      source: "session",
    })

    return NextResponse.json({
      ok: true,
      page_id: row.page_id,
      url: row.url,
      exchanges: exchanges.length,
    })
  } catch (error) {
    console.error("[dakota/memory/session] error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "unknown" },
      { status: 500 }
    )
  }
}
