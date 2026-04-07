import { NextRequest, NextResponse } from "next/server"
import { anthropic } from "@ai-sdk/anthropic"
import { generateText } from "ai"
import {
  getDakotaMemory,
  setDakotaMemory,
  appendDakotaLogExchanges,
  getRecentDakotaLog,
} from "@/lib/notion/dakotaMemory"

interface SyncBody {
  exchanges: Array<{ role: "user" | "assistant"; content: string }>
}

const SUMMARIZE_PROMPT = `당신은 척추신경외과 전문의 Dr. Woon Tak Yuh(센터장)의 개인 비서 Dakota의 기억 관리자입니다.

기존 장기 기억과 최근 대화를 받아, 장기 기억을 업데이트해 반환하세요.

규칙:
- 반환은 순수 메모 텍스트만. 인용부호나 코드 펜스 금지.
- 한국어로 작성.
- 장기적으로 가치 있는 사실만 보존:
  • 센터장님의 선호/습관 (예: "새벽에 일하는 편", "BJJ는 화·목·토")
  • 일정 규칙성 (예: "수술일은 주로 화·금")
  • 가족/팀 관련 사실 (이름, 관계)
  • 진행 중인 프로젝트/연구 (제목, 단계, 마감)
  • 명시적으로 "기억해줘"라고 한 사실
- 일회성 잡담, 인사, 날씨 언급 등은 버리기.
- 기존 메모와 중복되면 합치기. 모순되면 새 정보로 대체.
- 불필요한 헤더/리스트 마커 없이 짧은 문장의 줄바꿈 모음으로 작성.
- 전체 1500자 이하. 넘으면 가장 오래되거나 덜 중요한 것부터 압축.`

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const wantLog = url.searchParams.get("log") === "1"
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "30"), 100)

    if (wantLog) {
      const log = await getRecentDakotaLog(limit)
      return NextResponse.json({ log })
    }

    const text = await getDakotaMemory()
    return NextResponse.json({ text })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY 미설정" }, { status: 503 })
  }

  try {
    const body = (await req.json()) as SyncBody
    const exchanges = body.exchanges ?? []
    if (exchanges.length === 0) {
      return NextResponse.json({ skipped: true, reason: "no exchanges" })
    }

    // 1) raw archive로 항상 append (절대 손실 없음)
    await appendDakotaLogExchanges(exchanges).catch((e) => {
      console.warn("[dakota/memory] log append failed:", e)
    })

    const existing = await getDakotaMemory()

    const exchangeText = exchanges
      .map((m) => `${m.role === "user" ? "센터장" : "Dakota"}: ${m.content}`)
      .join("\n\n")

    const userMsg = `[기존 장기 기억]\n${existing || "(비어있음)"}\n\n[최근 대화]\n${exchangeText}\n\n위 대화에서 장기 기억에 추가/수정할 만한 내용을 반영한 새 장기 기억 전체를 출력해주세요.`

    const result = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      system: SUMMARIZE_PROMPT,
      messages: [{ role: "user", content: userMsg }],
    })

    const updated = result.text.trim()
    if (!updated) {
      return NextResponse.json({ skipped: true, reason: "empty summary" })
    }

    await setDakotaMemory(updated)
    return NextResponse.json({ ok: true, length: updated.length })
  } catch (error) {
    console.error("[dakota/memory] error:", error)
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
