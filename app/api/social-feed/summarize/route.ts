import { NextRequest, NextResponse } from "next/server"
import type { SocialSummarizeRequest, SocialSummarizeResponse } from "@/lib/types/social"

interface GroqResponse {
  choices?: Array<{ message?: { content?: string } }>
}

const SYSTEM_PROMPT = [
  "당신은 영문 소셜 게시글(트윗/스레드)을 한국어로 번역·요약·정리하는 전문가입니다.",
  "주어진 게시글 원문을 한국어로 자연스럽게 옮기고 핵심을 정리하세요.",
  "",
  "규칙:",
  "- 반드시 순수 한국어만 사용 (한글, 영문 고유명사, 숫자만 허용)",
  "- 중국어(漢字)·일본어(かな/カナ) 등 타언어 문자 사용 금지",
  "- 원문에 없는 내용 창작 금지 — 번역·요약만",
  "- 핵심을 3~6문장으로. 링크/멘션은 필요 시만 언급",
  "- 군더더기 인사말 없이 내용만 출력 (JSON 아님, 순수 텍스트)",
].join("\n")

// Llama 한국어 생성 시 섞이는 타언어 글자 후처리 제거 (ai-feed/summarize와 동일 정책)
function sanitizeKorean(text: string): string {
  return text
    .replace(/[一-鿿㐀-䶿]/g, "")
    .replace(/[぀-ゟ゠-ヿ]/g, "")
    .replace(/[Ā-ɏ]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SocialSummarizeRequest
    const text = body.text?.trim()
    if (!text) {
      return NextResponse.json({ error: "text 필수" }, { status: 400 })
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
        max_tokens: 800,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `원문:\n${text}` },
        ],
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      return NextResponse.json({ error: `Groq API error ${res.status}: ${errBody}` }, { status: 502 })
    }

    const data = (await res.json()) as GroqResponse
    const raw = data.choices?.[0]?.message?.content?.trim() ?? ""
    const summary = sanitizeKorean(raw) || "요약을 생성하지 못했습니다. 원문을 확인해 주세요."

    const response: SocialSummarizeResponse = { summary }
    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
