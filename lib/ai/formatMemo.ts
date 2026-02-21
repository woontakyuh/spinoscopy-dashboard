import type { FormattedMemo, MemoCategory } from "@/lib/types/draft"

interface GroqResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

function normalizeCategory(category?: string): MemoCategory {
  if (category === "research") return "research"
  if (category === "idea") return "idea"
  return "patient"
}

function getTemplateGuide(category: MemoCategory): string {
  if (category === "patient") {
    return [
      "# {{제목}}",
      "## 환자 정보",
      "- ",
      "## 소견",
      "- ",
      "## TODO",
      "- [ ] ",
    ].join("\n")
  }

  if (category === "research") {
    return [
      "# {{제목}}",
      "## 연구 주제",
      "- ",
      "## 배경",
      "- ",
      "## 방법론",
      "- ",
      "## 메모",
      "- ",
    ].join("\n")
  }

  return [
    "# {{제목}}",
    "## 제목",
    "- ",
    "## 내용",
    "- ",
  ].join("\n")
}

function extractJson(text: string): FormattedMemo {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed

  try {
    const parsed = JSON.parse(candidate) as Partial<FormattedMemo>
    if (!parsed.title || !parsed.markdown || !parsed.category) {
      throw new Error("invalid json payload")
    }
    return {
      title: parsed.title.slice(0, 120),
      markdown: parsed.markdown.slice(0, 10000),
      category: normalizeCategory(parsed.category),
    }
  } catch {
    const lines = trimmed.split("\n").filter(Boolean)
    const title = lines[0]?.replace(/^#\s*/, "").trim() || "Untitled Memo"
    const markdown = trimmed.startsWith("#") ? trimmed : `# ${title}\n\n${trimmed}`
    return {
      title: title.slice(0, 120),
      markdown: markdown.slice(0, 10000),
      category: "patient",
    }
  }
}

export async function formatMemo(rawInput: string, category?: string): Promise<FormattedMemo> {
  const normalized = normalizeCategory(category)
  const apiKey = process.env.GROQ_API_KEY

  if (!apiKey) {
    throw new Error("GROQ_API_KEY missing")
  }

  const system = [
    "당신은 척추외과 의사의 메모 정리 도우미입니다.",
    "사용자 입력을 Obsidian용 마크다운으로 구조화합니다.",
    "반드시 JSON만 출력하세요.",
    "JSON 형식: {\"title\": string, \"markdown\": string, \"category\": \"patient\"|\"research\"|\"idea\"}",
    `요청 카테고리: ${normalized}`,
    "제목은 간결하게 한국어로 작성하세요.",
    "markdown은 반드시 # 제목으로 시작하세요.",
  ].join("\n")

  const user = [
    "아래 비정형 메모를 템플릿에 맞게 정리하세요.",
    "템플릿:",
    getTemplateGuide(normalized),
    "",
    "원문:",
    rawInput,
  ].join("\n")

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      max_tokens: 900,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Groq API error ${res.status}: ${body}`)
  }

  const data = (await res.json()) as GroqResponse
  const content = data.choices?.[0]?.message?.content?.trim()

  if (!content) {
    throw new Error("Groq response empty")
  }

  const parsed = extractJson(content)

  return {
    ...parsed,
    category: normalized,
  }
}
