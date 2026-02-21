import type { StructuredBjjNote } from "@/lib/types/sensei"

interface GroqResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

const ALLOWED_INSTRUCTORS = ["조준용", "김진우", "Open Mat"]
const ALLOWED_GYMS = ["DT Wire"]
const ALLOWED_CLASS = [
  "Lapel",
  "Worm",
  "Crab Ride",
  "Sit-up",
  "Double Sleeve",
  "DL takedown",
  "Squid",
  "Half Pass",
  "Reverse Worm",
  "Rubber guard",
  "Omoplata",
  "Triangle",
  "Gogoplata",
]
const ALLOWED_SPARRING = [
  "Half Gaurd",
  "Long step",
  "Octopus",
  "Head rock",
  "RDL",
  "Sit-up",
  "Worm",
  "No-gi",
]

function parseJson(content: string): Partial<StructuredBjjNote> {
  const trimmed = content.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const jsonText = fenced ? fenced[1] : trimmed
  try {
    return JSON.parse(jsonText) as Partial<StructuredBjjNote>
  } catch {
    return {}
  }
}

function pickAllowed(value: string | undefined, allowed: string[], fallback: string): string {
  if (!value) return fallback
  const found = allowed.find((v) => v.toLowerCase() === value.toLowerCase())
  return found ?? fallback
}

function pickAllowedMany(values: string[] | undefined, allowed: string[]): string[] {
  if (!values || values.length === 0) return []
  const set = new Set<string>()
  for (const raw of values) {
    const found = allowed.find((v) => v.toLowerCase() === raw.toLowerCase())
    if (found) set.add(found)
  }
  return Array.from(set)
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export async function formatBjjNote(rawInput: string): Promise<StructuredBjjNote> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new Error("GROQ_API_KEY missing")
  }

  const systemPrompt = [
    "당신은 주짓수 수련 노트를 Notion DB 형식으로 정리하는 도우미입니다.",
    "반드시 JSON만 출력하세요.",
    "JSON 스키마:",
    '{"title":"string","date":"YYYY-MM-DD","instructor":"string","gym":"string","classTags":["string"],"sparringTags":["string"],"note":"string"}',
    "title은 30자 내외 한국어로 간결하게 작성하세요.",
    `instructor는 다음 중 하나만 사용: ${ALLOWED_INSTRUCTORS.join(", ")}`,
    `gym은 다음 중 하나만 사용: ${ALLOWED_GYMS.join(", ")}`,
    `classTags는 다음 중에서만 선택: ${ALLOWED_CLASS.join(", ")}`,
    `sparringTags는 다음 중에서만 선택: ${ALLOWED_SPARRING.join(", ")}`,
    "알 수 없는 태그는 버리세요.",
    "date가 불명확하면 오늘 날짜를 사용하세요.",
    "note는 핵심 내용 + 개선 포인트를 한국어 불릿 형태로 정리하세요.",
  ].join("\n")

  const userPrompt = [
    "아래 수련 메모를 구조화하세요.",
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
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Groq API error ${res.status}: ${body}`)
  }

  const data = (await res.json()) as GroqResponse
  const content = data.choices?.[0]?.message?.content ?? ""
  const parsed = parseJson(content)

  const title = (parsed.title ?? rawInput.split("\n")[0] ?? "주짓수 수련").trim().slice(0, 80) || "주짓수 수련"
  const note = (parsed.note ?? rawInput).trim().slice(0, 1900)

  return {
    title,
    date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date ?? "") ? (parsed.date as string) : todayIso(),
    instructor: pickAllowed(parsed.instructor, ALLOWED_INSTRUCTORS, "Open Mat"),
    gym: pickAllowed(parsed.gym, ALLOWED_GYMS, "DT Wire"),
    classTags: pickAllowedMany(parsed.classTags, ALLOWED_CLASS),
    sparringTags: pickAllowedMany(parsed.sparringTags, ALLOWED_SPARRING),
    note,
  }
}
