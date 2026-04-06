import { NextRequest, NextResponse } from "next/server"

interface ParseRequest {
  text?: string
  image?: string
  type?: "schedule" | "todo"
}

interface ParsedScheduleData {
  name: string
  date_start: string
  date_end?: string
  place?: string
  category?: string
  society?: string[]
  topic?: string
  link?: string
  abstract_deadline?: string
}

interface ParseResponse {
  success: boolean
  parsed?: ParsedScheduleData
  parsed_todo?: ParsedTodoData
  error?: string
}

interface ParsedTodoData {
  name: string
  due?: string
  priority?: "High" | "Medium" | "Low"
  notes?: string
}

interface GroqResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>
    }
  }>
}

const TEXT_MODEL = "llama-3.3-70b-versatile"
const VISION_MODEL = "llama-3.2-11b-vision-preview"
const ALLOWED_CATEGORIES = new Set(["Conf", "Spine", "AI", "Workshop", "Lecture", "Meeting", "Webinar"])

function getTodayInKst(): { today: string; dayOfWeek: string } {
  const now = new Date()
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)

  const dayOfWeek = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "long",
  }).format(now)

  return { today, dayOfWeek }
}

function getTomorrowInKst(today: string): string {
  const base = new Date(`${today}T00:00:00+09:00`)
  base.setUTCDate(base.getUTCDate() + 1)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(base)
}

function buildScheduleSystemPrompt(vision: boolean): string {
  const { today, dayOfWeek } = getTodayInKst()
  return [
    "당신은 일정 정보 추출 전문가입니다. 사용자의 자연어 입력에서 일정 정보를 추출하여 JSON으로 반환하세요.",
    vision ? "첨부된 이미지에서 일정/학회/이벤트 정보를 추출하세요." : "",
    "",
    `오늘 날짜: ${today} (${dayOfWeek})`,
    "",
    "규칙:",
    "- \"다음주 화요일\" 같은 상대 날짜는 오늘 기준으로 절대 날짜(YYYY-MM-DD)로 변환",
    "- \"3월 15-17일\" 같은 기간은 date_start와 date_end로 분리",
    "- category는 다음 중 하나: Conf, Spine, AI, Workshop, Lecture, Meeting, Webinar",
    "  - 학회/컨퍼런스 → Conf, 수술 관련 → Spine, AI 관련 → AI, 워크샵 → Workshop, 강의 → Lecture, 회의 → Meeting",
    "- society는 학회명 배열 (AANS, NASS, KSSS 등)",
    "- 추출할 수 없는 필드는 생략",
    "",
    "출력 형식 (JSON만):",
    '{"name":"...", "date_start":"2026-03-15", "date_end":"2026-03-17", "place":"Chicago", "category":"Conf", "society":["AANS"]}',
  ]
    .filter(Boolean)
    .join("\n")
}

function buildTodoSystemPrompt(): string {
  const { today, dayOfWeek } = getTodayInKst()
  const tomorrow = getTomorrowInKst(today)
  return [
    "당신은 할 일 정보 추출 전문가입니다. 사용자의 자연어를 JSON으로 구조화하세요.",
    "반드시 JSON만 출력하세요.",
    "",
    `오늘 날짜: ${today} (${dayOfWeek})`,
    "",
    "규칙:",
    "- 추출 필드: name(필수), due(선택), priority(선택), notes(선택)",
    "- 상대 날짜(내일, 다음주 화요일 등)는 오늘 기준 YYYY-MM-DD로 변환",
    "- priority는 High/Medium/Low 중 하나만 사용",
    "- 중요/급함/urgent/critical이면 High, 보통이면 Medium, 여유/나중이면 Low",
    "- 핵심 작업명만 name에 넣고 부연 설명은 notes에 분리",
    "",
    "예시 입력: 내일까지 OP note 정리 중요",
    `예시 출력: {"name":"OP note 정리","due":"${tomorrow}","priority":"High"}`,
  ].join("\n")
}

function normalizeImageData(image: string): string {
  const trimmed = image.trim()
  if (!trimmed) return ""
  if (trimmed.startsWith("data:image/")) return trimmed
  return `data:image/jpeg;base64,${trimmed}`
}

function extractMessageContent(data: GroqResponse): string {
  const content = data.choices?.[0]?.message?.content
  if (typeof content === "string") {
    return content.trim()
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item.text === "string" ? item.text : ""))
      .join("\n")
      .trim()
  }
  return ""
}

function parseScheduleJsonBlock(raw: string): ParsedScheduleData | null {
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start < 0 || end < 0 || end <= start) {
    return null
  }

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1))
    if (!parsed || typeof parsed !== "object") {
      return null
    }

    const json = parsed as Record<string, unknown>

    const name = typeof json.name === "string" ? json.name.trim() : ""
    const dateStart = typeof json.date_start === "string" ? json.date_start.trim() : ""
    if (!name || !dateStart) {
      return null
    }

    const categoryRaw = typeof json.category === "string" ? json.category.trim() : ""
    const category = ALLOWED_CATEGORIES.has(categoryRaw) ? categoryRaw : undefined

    const society = Array.isArray(json.society)
      ? json.society
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : undefined

    return {
      name,
      date_start: dateStart,
      date_end: typeof json.date_end === "string" ? json.date_end.trim() : undefined,
      place: typeof json.place === "string" ? json.place.trim() : undefined,
      category,
      society: society && society.length > 0 ? society : undefined,
      topic: typeof json.topic === "string" ? json.topic.trim() : undefined,
      link: typeof json.link === "string" ? json.link.trim() : undefined,
      abstract_deadline: typeof json.abstract_deadline === "string" ? json.abstract_deadline.trim() : undefined,
    }
  } catch {
    return null
  }
}

function parseTodoJsonBlock(raw: string): ParsedTodoData | null {
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start < 0 || end < 0 || end <= start) {
    return null
  }

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1))
    if (!parsed || typeof parsed !== "object") {
      return null
    }

    const json = parsed as Record<string, unknown>
    const name = typeof json.name === "string" ? json.name.trim() : ""
    if (!name) {
      return null
    }

    const dueRaw = typeof json.due === "string" ? json.due.trim() : ""
    const due = /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) ? dueRaw : undefined

    const priorityRaw = typeof json.priority === "string" ? json.priority.trim() : ""
    const priority = priorityRaw === "High" || priorityRaw === "Medium" || priorityRaw === "Low"
      ? priorityRaw
      : undefined

    const notes = typeof json.notes === "string" ? json.notes.trim() : ""

    return {
      name,
      due,
      priority,
      notes: notes || undefined,
    }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ParseRequest
    const text = body.text?.trim() ?? ""
    const image = body.image?.trim() ?? ""
    const type = body.type === "todo" ? "todo" : "schedule"

    if (type === "schedule" && !text && !image) {
      return NextResponse.json<ParseResponse>({ success: false, error: "text 또는 image가 필요합니다." }, { status: 400 })
    }

    if (type === "todo" && !text) {
      return NextResponse.json<ParseResponse>({ success: false, error: "todo 파싱에는 text가 필요합니다." }, { status: 400 })
    }

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      return NextResponse.json<ParseResponse>({ success: false, error: "GROQ_API_KEY missing" }, { status: 500 })
    }

    const usesVision = type === "schedule" && Boolean(image)
    const systemPrompt = type === "todo" ? buildTodoSystemPrompt() : buildScheduleSystemPrompt(usesVision)
    const endpoint = "https://api.groq.com/openai/v1/chat/completions"

    const payload = usesVision
      ? {
          model: VISION_MODEL,
          temperature: 0.1,
          max_tokens: 900,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: text || "이 이미지에서 일정 정보를 추출해주세요." },
                { type: "image_url", image_url: { url: normalizeImageData(image) } },
              ],
            },
          ],
        }
      : {
          model: TEXT_MODEL,
          temperature: 0.1,
          max_tokens: 900,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text },
          ],
        }

    const groqRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!groqRes.ok) {
      const errorBody = await groqRes.text()
      return NextResponse.json<ParseResponse>(
        { success: false, error: `Groq API error ${groqRes.status}: ${errorBody}` },
        { status: 502 }
      )
    }

    const data = (await groqRes.json()) as GroqResponse
    const raw = extractMessageContent(data)

    if (type === "todo") {
      const parsedTodo = parseTodoJsonBlock(raw)
      if (!parsedTodo) {
        return NextResponse.json<ParseResponse>(
          { success: false, error: "모델 응답에서 유효한 할 일 JSON을 추출하지 못했습니다." },
          { status: 422 }
        )
      }

      return NextResponse.json<ParseResponse>({ success: true, parsed_todo: parsedTodo })
    }

    const parsed = parseScheduleJsonBlock(raw)

    if (!parsed) {
      return NextResponse.json<ParseResponse>(
        { success: false, error: "모델 응답에서 유효한 일정 JSON을 추출하지 못했습니다." },
        { status: 422 }
      )
    }

    return NextResponse.json<ParseResponse>({ success: true, parsed })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json<ParseResponse>({ success: false, error: message }, { status: 500 })
  }
}
