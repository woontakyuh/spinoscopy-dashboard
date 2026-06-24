import { NextRequest, NextResponse } from "next/server"
import type { SocialSummarizeRequest, SocialSummarizeResponse } from "@/lib/types/social"

interface GroqResponse {
  choices?: Array<{ message?: { content?: string } }>
}

const SYSTEM_PROMPT = [
  "당신은 소셜 게시글(트윗/스레드)을 '한 줄 핵심 요약'으로 압축하는 전문가입니다.",
  "목표: 바빠서 원문을 안 읽어도 '무슨 얘기인지' 한눈에 파악되게 하는 것.",
  "",
  "규칙:",
  "- **번역이 아니라 요약.** 원문 문장을 그대로 옮기지 말 것.",
  "- **핵심 1가지만. 한 문장(필요시 최대 2문장), 원문 길이의 1/3 이하로 압축.**",
  "- 세부·예시·수사·해시태그·인사말·링크는 버리고 결론/요점만.",
  "- 외국어(영문 등)면 한국어로 옮겨 요약, 한국어면 더 짧게 추림.",
  "- 순수 한국어만 (한글·영문 고유명사·숫자). 중국어/일본어 문자 금지.",
  "- 원문에 없는 내용 창작 금지. 군더더기 없이 요약문만 출력(JSON 아님).",
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
