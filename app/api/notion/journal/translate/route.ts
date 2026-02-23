import { NextRequest, NextResponse } from "next/server"

type TranslateMode = "translate" | "summarize"

interface TranslateRequestBody {
  abstract: string
  mode: TranslateMode
}

interface GroqResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

const SYSTEM_PROMPTS: Record<TranslateMode, string> = {
  translate:
    "You are a medical paper translation expert. Translate the following English abstract into natural Korean. Use proper Korean medical terminology. Return only the translation, no explanations.",
  summarize:
    "You are a medical paper summarization expert. Summarize the following English abstract into ONE concise Korean sentence (max 100 characters). Focus on the key finding and clinical significance. Return only the summary sentence.",
}

function sanitizeKorean(text: string): string {
  return text
    .replace(/[\u4E00-\u9FFF\u3400-\u4DBF]/g, "")
    .replace(/[\u3040-\u309F\u30A0-\u30FF]/g, "")
    .replace(/[\u0100-\u024F]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<TranslateRequestBody>
    const abstract = typeof body.abstract === "string" ? body.abstract.trim() : ""
    const mode = body.mode

    if (!abstract) {
      return NextResponse.json({ error: "abstract 필수" }, { status: 400 })
    }

    if (mode !== "translate" && mode !== "summarize") {
      return NextResponse.json({ error: "mode는 translate 또는 summarize 여야 합니다" }, { status: 400 })
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
        max_tokens: mode === "translate" ? 2000 : 200,
        messages: [
          { role: "system", content: SYSTEM_PROMPTS[mode] },
          { role: "user", content: abstract },
        ],
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      return NextResponse.json({ error: `Groq API error ${res.status}: ${errBody}` }, { status: 502 })
    }

    const data = (await res.json()) as GroqResponse
    const rawText = data.choices?.[0]?.message?.content?.trim() ?? ""
    const result = sanitizeKorean(rawText)

    if (!result) {
      return NextResponse.json({ error: "응답 생성 실패" }, { status: 502 })
    }

    if (mode === "translate") {
      return NextResponse.json({ translation: result })
    }

    return NextResponse.json({ summary: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
