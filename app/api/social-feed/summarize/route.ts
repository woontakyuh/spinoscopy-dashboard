import { NextRequest, NextResponse } from "next/server"
import type { SocialSummarizeRequest, SocialSummarizeResponse } from "@/lib/types/social"

interface GroqResponse {
  choices?: Array<{ message?: { content?: string } }>
}

const SYSTEM_PROMPT = [
  "당신은 소셜 게시글(트윗/스레드)을 '불릿 핵심정리'로 만드는 전문가입니다.",
  "목표: 이 요약만 읽고도 원문 내용을 **거의 다 파악**할 수 있게 하는 것.",
  "",
  "출력 형식:",
  "- '· '로 시작하는 불릿 3~6개 (내용 적으면 2개).",
  "- **각 불릿은 정보가 담긴 완결된 한 줄.** 무슨 일/무엇/수치·고유명사·이유·결론을 실제로 담는다.",
  "- 키워드·소제목만 나열 금지 (예: '· ChatGPT 도입' (X) → '· 삼성전자, 전 직원에 ChatGPT Enterprise·Codex 도입 (오픈AI 역대 최대 기업 배포)' (O)).",
  "",
  "내용 규칙:",
  "- 번역이 아니라 정리. 원문 문장을 그대로 베끼지 말되, **핵심 정보는 하나도 빠뜨리지 말 것.**",
  "- 인사말·수사·해시태그·홍보 멘트만 제거. 사실·수치·주장은 보존.",
  "- 외국어(영문 등)면 한국어로 옮겨 정리.",
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
