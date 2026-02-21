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

const INSTRUCTOR_ALIASES: Record<string, string[]> = {
  "조준용": ["조준용", "조준용관장", "조관장", "준용", "준용관장"],
  "김진우": ["김진우", "김진우관장", "김관장", "진우", "진우관장"],
  "Open Mat": ["open mat", "openmat", "오픈매트", "오픈 매트"],
}

const GYM_ALIASES: Record<string, string[]> = {
  "DT Wire": ["dt wire", "dtwire", "와이어", "디티와이어", "dt"],
}

const CLASS_ALIASES: Record<string, string[]> = {
  "Lapel": ["lapel", "라펠", "라펠가드", "라펠 가드"],
  "Worm": ["worm", "웜", "웜가드", "웜 가드"],
  "Crab Ride": ["crab ride", "crab", "크랩", "크랩라이드", "크랩 라이드"],
  "Sit-up": ["sit-up", "situp", "싯업", "싯업가드", "싯업 가드"],
  "Double Sleeve": ["double sleeve", "더블슬리브", "더블 슬리브"],
  "DL takedown": ["dl takedown", "dl", "더블렉", "double leg", "double-leg"],
  "Squid": ["squid", "스퀴드", "스퀴드가드", "스퀴드 가드"],
  "Half Pass": ["half pass", "하프패스", "하프 패스"],
  "Reverse Worm": ["reverse worm", "리버스웜", "리버스 웜"],
  "Rubber guard": ["rubber guard", "러버가드", "러버 가드"],
  "Omoplata": ["omoplata", "오모플라타"],
  "Triangle": ["triangle", "트라이앵글", "삼각"],
  "Gogoplata": ["gogoplata", "고고플라타"],
}

const SPARRING_ALIASES: Record<string, string[]> = {
  "Half Gaurd": ["half guard", "half gaurd", "하프가드", "하프 가드"],
  "Long step": ["long step", "롱스텝", "롱 스텝"],
  "Octopus": ["octopus", "옥토퍼스", "옥토"],
  "Head rock": ["head rock", "헤드락", "헤드 락"],
  "RDL": ["rdl", "리버스데라리바", "reverse de la riva", "reverse dela riva"],
  "Sit-up": ["sit-up", "situp", "싯업", "싯업가드"],
  "Worm": ["worm", "웜", "웜가드"],
  "No-gi": ["nogi", "no-gi", "노기", "노 기"],
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

function pickAllowed(
  value: string | undefined,
  allowed: string[],
  aliases: Record<string, string[]>,
  fallback: string
): string {
  if (!value) return fallback
  const normalized = normalizeToken(value)
  const direct = allowed.find((v) => normalizeToken(v) === normalized)
  if (direct) return direct

  const byAlias = allowed.find((v) => (aliases[v] ?? []).some((a) => normalizeToken(a) === normalized))
  return byAlias ?? fallback
}

function pickAllowedMany(values: string[] | undefined, allowed: string[], aliases: Record<string, string[]>): string[] {
  const set = new Set<string>()
  for (const raw of values ?? []) {
    const picked = pickAllowed(raw, allowed, aliases, "")
    if (picked) set.add(picked)
  }
  return Array.from(set)
}

function extractAllowedFromText(text: string, allowed: string[], aliases: Record<string, string[]>): string[] {
  const normalizedText = normalizeToken(text)
  const set = new Set<string>()

  for (const candidate of allowed) {
    const keys = [candidate, ...(aliases[candidate] ?? [])]
    if (keys.some((k) => normalizedText.includes(normalizeToken(k)))) {
      set.add(candidate)
    }
  }

  return Array.from(set)
}

function mergeUnique(a: string[], b: string[]): string[] {
  return Array.from(new Set([...a, ...b]))
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function parseDateFromRaw(rawInput: string): string | null {
  const now = new Date()
  const text = rawInput.toLowerCase()

  if (text.includes("오늘")) return now.toISOString().slice(0, 10)
  if (text.includes("어제")) {
    const d = new Date(now)
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  }

  const ymd = rawInput.match(/(20\d{2})[./-](\d{1,2})[./-](\d{1,2})/)
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`
  }

  const md = rawInput.match(/(^|\s)(\d{1,2})[./-](\d{1,2})(\s|$)/)
  if (md) {
    const yyyy = String(now.getFullYear())
    return `${yyyy}-${md[2].padStart(2, "0")}-${md[3].padStart(2, "0")}`
  }

  return null
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

function pickDate(modelDate: string | undefined, rawInput: string): string {
  if (modelDate && /^\d{4}-\d{2}-\d{2}$/.test(modelDate)) {
    return modelDate
  }
  return parseDateFromRaw(rawInput) ?? todayIso()
}

function pickInstructor(modelValue: string | undefined, rawInput: string): string {
  const byModel = pickAllowed(modelValue, ALLOWED_INSTRUCTORS, INSTRUCTOR_ALIASES, "")
  const byText = extractAllowedFromText(rawInput, ALLOWED_INSTRUCTORS, INSTRUCTOR_ALIASES)[0]
  return byModel || byText || "Open Mat"
}

function pickGym(modelValue: string | undefined, rawInput: string): string {
  const byModel = pickAllowed(modelValue, ALLOWED_GYMS, GYM_ALIASES, "")
  const byText = extractAllowedFromText(rawInput, ALLOWED_GYMS, GYM_ALIASES)[0]
  return byModel || byText || "DT Wire"
}

function pickClassTags(modelValues: string[] | undefined, rawInput: string): string[] {
  const byModel = pickAllowedMany(modelValues, ALLOWED_CLASS, CLASS_ALIASES)
  const byText = extractAllowedFromText(rawInput, ALLOWED_CLASS, CLASS_ALIASES)
  return mergeUnique(byModel, byText)
}

function pickSparringTags(modelValues: string[] | undefined, rawInput: string): string[] {
  const byModel = pickAllowedMany(modelValues, ALLOWED_SPARRING, SPARRING_ALIASES)
  const byText = extractAllowedFromText(rawInput, ALLOWED_SPARRING, SPARRING_ALIASES)
  return mergeUnique(byModel, byText)
}

function isOpenMat(instructor: string, sourceText: string): boolean {
  if (instructor === "Open Mat") return true
  const normalized = normalizeToken(sourceText)
  return ["openmat", "오픈매트"].some((k) => normalized.includes(normalizeToken(k)))
}

function normalizeTagsForOpenMat(classTags: string[], sparringTags: string[]): { classTags: string[]; sparringTags: string[] } {
  const merged = mergeUnique(sparringTags, classTags)
  return {
    classTags: [],
    sparringTags: merged,
  }
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

  const userPrompt = ["아래 수련 메모를 구조화하세요.", "원문:", rawInput].join("\n")

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

  const sourceText = [rawInput, parsed.title ?? "", parsed.note ?? ""].join("\n")

  const instructor = pickInstructor(parsed.instructor, sourceText)
  let classTags = pickClassTags(parsed.classTags, sourceText)
  let sparringTags = pickSparringTags(parsed.sparringTags, sourceText)

  if (isOpenMat(instructor, sourceText)) {
    const normalized = normalizeTagsForOpenMat(classTags, sparringTags)
    classTags = normalized.classTags
    sparringTags = normalized.sparringTags
  }

  return {
    title: pickTitle(parsed.title, rawInput),
    date: pickDate(parsed.date, rawInput),
    instructor,
    gym: pickGym(parsed.gym, sourceText),
    classTags,
    sparringTags,
    note: pickNote(parsed.note, rawInput),
  }
}
