import type { SenseiSessionType, StructuredBjjNote } from "@/lib/types/sensei"
import type { SenseiTagOptions } from "@/lib/notion/sensei"
import { buildTagReferencePrompt } from "./bjjTags"

interface GroqResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

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

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9가-힣]/g, "")
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function pickTitle(modelTitle: string | undefined, rawInput: string): string {
  const firstLine = rawInput.split("\n").find((line) => line.trim()) ?? "주짓수 수련"
  const title = (modelTitle ?? firstLine).trim()
  return (title || "주짓수 수련").slice(0, 80)
}

function pickNote(modelNote: string | undefined, rawInput: string): string {
  const note = (modelNote ?? rawInput).trim()
  if (!note) return "- 핵심 포인트 정리 필요"
  return note.slice(0, 1900)
}

function pickDate(modelDate: string | undefined): string {
  if (modelDate && /^\d{4}-\d{2}-\d{2}$/.test(modelDate)) {
    return modelDate
  }
  return todayIso()
}

function dedup(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function isOpenMat(instructor: string, sourceText: string): boolean {
  if (instructor === "Open Mat") return true
  const normalized = normalizeToken(sourceText)
  return ["openmat", "오픈매트"].some((k) => normalized.includes(k))
}

function buildSystemPrompt(tags: SenseiTagOptions): string {
  const classStr = tags.classTags.length > 0 ? tags.classTags.join(", ") : "(아직 없음)"
  const sparringStr = tags.sparringTags.length > 0 ? tags.sparringTags.join(", ") : "(아직 없음)"
  const instructorStr = tags.instructors.length > 0 ? tags.instructors.join(", ") : "Open Mat"
  const gymStr = tags.gyms.length > 0 ? tags.gyms.join(", ") : "DT Wire"

  return [
    "주짓수 수련 노트를 Notion DB 형식 JSON으로 정리하라. JSON만 출력.",
    '{"title":"string","date":"YYYY-MM-DD","instructor":"string","gym":"string","classTags":["string"],"sparringTags":["string"],"note":"string"}',
    "",
    "title: 30자 내외 한국어.",
    `instructor: 기존 값 중 선택: ${instructorStr}. 해당 없으면 "Open Mat".`,
    `gym: 기존 값 중 선택: ${gymStr}. 해당 없으면 그대로 써.`,
    "",
    "태그는 반드시 아래 약어 레퍼런스의 약어(abbreviation)를 사용:",
    buildTagReferencePrompt(),
    "",
    "태그 규칙:",
    `- classTags 기존: ${classStr}`,
    `- sparringTags 기존: ${sparringStr}`,
    "- 기존 태그와 동일한 기술이면 기존 태그명 그대로 사용.",
    "- 레퍼런스에 있는 기술이면 반드시 해당 약어 사용 (예: Half Guard → HG, Torreando Pass → TP).",
    "- 레퍼런스에 없는 새로운 기술이면 영문 약어를 만들어서 사용.",
    "- 한국어 기술명은 반드시 영문 약어로 변환 (예: 하프가드 → HG, 토레안도 → TP).",
    "- 수업에서 배운 기술 → classTags, 스파링에서 사용한 기술 → sparringTags.",
    "",
    "note: 핵심 내용 + 개선 포인트를 한국어 불릿으로 정리.",
    "date 불명확하면 오늘 날짜 사용.",
  ].join("\n")
}

export async function formatBjjNote(rawInput: string, tags: SenseiTagOptions): Promise<StructuredBjjNote> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new Error("GROQ_API_KEY missing")
  }

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
        { role: "system", content: buildSystemPrompt(tags) },
        { role: "user", content: `수련 메모:\n${rawInput}` },
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

  const instructor = parsed.instructor ?? "Open Mat"
  let classTags = dedup(parsed.classTags ?? [])
  let sparringTags = dedup(parsed.sparringTags ?? [])

  const sourceText = [rawInput, parsed.title ?? ""].join("\n")
  const openMat = isOpenMat(instructor, sourceText)
  const sessionType: SenseiSessionType = openMat ? "openmat" : "class"

  if (openMat) {
    sparringTags = dedup([...sparringTags, ...classTags])
    classTags = []
  }

  return {
    title: pickTitle(parsed.title, rawInput),
    sessionType,
    date: pickDate(parsed.date),
    instructor,
    gym: parsed.gym ?? (tags.gyms[0] || "DT Wire"),
    classTags,
    sparringTags,
    note: pickNote(parsed.note, rawInput),
  }
}
