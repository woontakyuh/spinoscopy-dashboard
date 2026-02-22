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
  "당신은 AI/기술 뉴스 요약 전문가입니다.",
  "주어진 기사 제목과 URL을 보고 한국어로 한 줄 요약을 작성하세요.",
  "규칙:",
  "- 반드시 한국어로 작성",
  "- 한 문장, 최대 80자",
  "- 핵심 내용만 간결하게",
  "- 요약문만 출력 (부가 설명 없이)",
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
        max_tokens: 200,
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
