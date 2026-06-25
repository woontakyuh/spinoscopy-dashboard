import { NextRequest, NextResponse } from "next/server"
import type { SocialSummarizeRequest, SocialSummarizeResponse } from "@/lib/types/social"

interface GroqResponse {
  choices?: Array<{ message?: { content?: string } }>
}

const SYSTEM_PROMPT = [
  "당신은 소셜 게시글(트윗/스레드)을 '한눈에 파악되는 핵심 정리'로 만드는 전문가입니다.",
  "목표: 바빠서 원문을 안 읽어도 주요 정보가 일목요연하게 들어오게 하는 것.",
  "",
  "출력 형식 (반드시 이대로):",
  "- 짧은 불릿 2~5개. 각 줄은 '· '로 시작.",
  "- 각 불릿은 완결 문장이 아니라 **핵심 정보 한 토막**(명사구/짧은 구). 군더더기·수사·인사말 제거.",
  "- 게시글이 한 가지 단순 내용이면 1~2개만.",
  "",
  "내용 규칙:",
  "- **번역이 아니라 정리.** 원문 문장을 그대로 옮기지 말 것.",
  "- 단, 주요 정보(누가/무엇을/수치·고유명사·결론)는 빠뜨리지 말 것 — 너무 다 빼지 않는다.",
  "- 외국어(영문 등)면 한국어로 옮겨 정리, 한국어면 더 압축.",
  "- 순수 한국어만 (한글·영문 고유명사·숫자). 중국어/일본어 문자 금지.",
  "- 원문에 없는 내용 창작 금지. 불릿 목록만 출력(JSON·머리말 없이).",
].join("\n")

// Llama 한국어 생성 시 섞이는 타언어 글자 후처리 제거 (ai-feed/summarize와 동일 정책)
function sanitizeKorean(text: string): string {
  return text
    .replace(/[一-鿿㐀-䶿]/g, "")
    .replace(/[぀-ゟ゠-ヿ]/g, "")
    .replace(/[Ā-ɏ]/g, "")
    .replace(/[ \t]{2,}/g, " ") // 공백/탭만 병합 — 불릿 줄바꿈(\n) 보존
    .replace(/\n{3,}/g, "\n\n")
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
