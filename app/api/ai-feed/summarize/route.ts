import { NextRequest, NextResponse } from "next/server"
import type { SummarizeRequest, SummarizeResponse } from "@/lib/types/radar"
import { inferCategories, scoreImportance } from "@/lib/radar/classify"
import { getSourceConfig } from "@/lib/radar/sources"

interface ParsedAiResult {
  summary: string
  categories: SummarizeResponse["categories"]
  importanceScore: SummarizeResponse["importanceScore"]
  notes: string
}

interface GroqResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

const SYSTEM_PROMPT = [
  "당신은 AI/기술 뉴스 분류 및 요약 전문가입니다.",
  "주어진 기사 제목, URL, 소스를 기반으로 한국어로 요약 + 분류를 수행하세요.",
  "",
  "규칙:",
  "- 반드시 순수 한국어만 사용 (한글, 영문 고유명사, 숫자만 허용)",
  "- 절대 중국어(漢字), 일본어(ひらがな/カタカナ), 베트남어 등 타언어 문자 사용 금지",
  "- 한자어는 반드시 한글로 표기 (예: 智能→지능, 里程碑→이정표, 應用→응용)",
  "- 의료 조언 금지, 연구/뉴스 사실 중심",
  "- JSON으로만 응답",
  "- category는 model-release/tool/research/policy/medical-ai 중 1~2개",
  "- importanceScore는 1~5 정수",
  "- summary는 4~7문장",
  "- notes는 중요도를 준 근거를 1~2문장으로 작성",
  "",
  "출력 스키마:",
  '{"summary":"...","categories":["tool"],"importanceScore":3,"notes":"..."}',
].join("\n")

/**
 * Llama 모델이 한국어 생성 시 중국어/베트남어 글자를 섞어 넣는 문제를 후처리로 제거.
 * 허용: 한글, 영문, 숫자, 일반 구두점/기호, 공백
 */
function sanitizeKorean(text: string): string {
  return text
    .replace(/[\u4E00-\u9FFF\u3400-\u4DBF]/g, "")    // CJK Unified Ideographs (한자)
    .replace(/[\u3040-\u309F\u30A0-\u30FF]/g, "")    // Hiragana + Katakana
    .replace(/[\u0100-\u024F]/g, "")                   // Latin Extended (Vietnamese diacritics 등)
    .replace(/\s{2,}/g, " ")                            // 제거 후 남은 이중 공백 정리
    .trim()
}

function parseAiJson(raw: string): ParsedAiResult | null {
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start < 0 || end < 0 || end <= start) return null

  try {
    const json = JSON.parse(raw.slice(start, end + 1)) as Partial<ParsedAiResult>
    const summary = typeof json.summary === "string" ? json.summary.trim() : ""
    const notes = typeof json.notes === "string" ? json.notes.trim() : ""
    const categories = Array.isArray(json.categories)
      ? json.categories.filter((c): c is ParsedAiResult["categories"][number] =>
          c === "model-release" ||
          c === "tool" ||
          c === "research" ||
          c === "policy" ||
          c === "medical-ai"
        )
      : []
    const importance = Number(json.importanceScore)
    if (!summary) return null
    if (!Number.isFinite(importance)) return null
    const importanceScore = Math.min(5, Math.max(1, Math.round(importance))) as ParsedAiResult["importanceScore"]

    return {
      summary,
      categories: categories.length > 0 ? categories : ["tool"],
      importanceScore,
      notes: notes || "AI 근거를 충분히 추출하지 못했습니다.",
    }
  } catch {
    return null
  }
}

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

    const sourceConfig = getSourceConfig(body.source)
    const fallbackCategories = inferCategories(body.title, body.source, sourceConfig?.tier ?? "newsletter")
    const fallbackImportance = scoreImportance(body.title, fallbackCategories, sourceConfig?.tier ?? "newsletter")

    const promptParts = [
      `제목: ${body.title}`,
      `URL: ${body.url}`,
      `소스: ${sourceConfig?.label ?? body.source}`,
      `티어: ${sourceConfig?.tier ?? "newsletter"}`,
      `주기: ${sourceConfig?.cadence ?? "24h"}`,
    ]
    if (body.description) {
      promptParts.push(`본문 요약: ${body.description}`)
    }
    const userPrompt = promptParts.join("\n")

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
          { role: "user", content: userPrompt },
        ],
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      return NextResponse.json({ error: `Groq API error ${res.status}: ${errBody}` }, { status: 502 })
    }

    const data = (await res.json()) as GroqResponse
    const rawText = data.choices?.[0]?.message?.content?.trim() ?? ""

    const parsed = parseAiJson(rawText)

    const summary = sanitizeKorean(parsed?.summary ?? "요약을 생성하지 못했습니다. 원문 링크에서 핵심 내용을 확인해 주세요.")
    const categories = parsed?.categories ?? fallbackCategories
    const importanceScore = parsed?.importanceScore ?? fallbackImportance
    const notes = sanitizeKorean(parsed?.notes ?? "규칙 기반 중요도를 사용했습니다.")

    const response: SummarizeResponse = {
      summary,
      categories,
      importanceScore,
      notes,
    }
    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
