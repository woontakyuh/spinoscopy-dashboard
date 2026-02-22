import { NextRequest, NextResponse } from "next/server"
import type { SummarizeRequest, SummarizeResponse } from "@/lib/types/radar"

interface GroqResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

const SYSTEM_PROMPT = [
  "당신은 AI/기술 뉴스 심층 분석 전문가입니다.",
  "주어진 기사 제목과 URL을 보고 한국어로 상세한 분석 요약을 작성하세요.",
  "",
  "규칙:",
  "- 반드시 한국어로 작성",
  "- 6~10문장으로 충분히 상세하게 분석",
  "- 다음 내용을 반드시 포함:",
  "  • 핵심 내용: 무엇이 발표/발견/변경되었는지 구체적으로",
  "  • 기술적 디테일: 모델명, 성능 수치, 아키텍처 등 구체적 정보",
  "  • 배경 맥락: 이 발표가 나오게 된 업계 흐름이나 경쟁 상황",
  "  • 산업 영향: 관련 기업, 개발자, 연구자에게 미치는 실질적 영향",
  "  • 시사점: 향후 전망이나 주목할 후속 변화",
  "- 구체적인 수치, 모델명, 기업명, 날짜 등 핵심 팩트를 반드시 포함",
  "- 단순 나열이 아닌 논리적 흐름으로 서술",
  "- 요약문만 출력 (제목, 라벨, 부가 설명 없이 본문만)",
].join("\n")

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SummarizeRequest

    if (!body.title) {
      return NextResponse.json({ error: "title 필수" }, { status: 400 })
    }

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "GROQ_API_KEY missing" }, { status: 500 })
    }

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.3,
        max_tokens: 1000,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `제목: ${body.title}\nURL: ${body.url}` },
        ],
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      return NextResponse.json({ error: `Groq API error ${res.status}: ${errBody}` }, { status: 502 })
    }

    const data = (await res.json()) as GroqResponse
    const summary = data.choices?.[0]?.message?.content?.trim() ?? "요약 실패"

    const response: SummarizeResponse = { summary }
    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
