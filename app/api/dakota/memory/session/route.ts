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

    // 1850자 넘으면 여러 row로 분할 저장 (손실 없음)
    const CHUNK = 1800
    const chunks: string[] = []
    for (let i = 0; i < transcript.length; i += CHUNK) {
      chunks.push(transcript.slice(i, i + CHUNK))
    }
    if (chunks.length === 0) chunks.push("")

    const results: Array<{ page_id: string; url: string }> = []
    for (let i = 0; i < chunks.length; i++) {
      const suffix = chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : ""
      const row = await createMemory({
        name: `[chat ${channel}] ${start.slice(6)}-${end.slice(12)}${suffix}`.slice(0, 200),
        category: "fact",
        content: chunks[i],
        importance: 1,
        source: "session",
      })
      results.push({ page_id: row.page_id, url: row.url })
    }

    return NextResponse.json({
      ok: true,
      chunks: results.length,
      pages: results,
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
