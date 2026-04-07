import { anthropic } from "@ai-sdk/anthropic"
import { streamText, stepCountIs, tool } from "ai"
import { z } from "zod"
import { getAllTodos } from "@/lib/notion/todo"
import { getUpcomingSchedules, getSchedulesRichInRange } from "@/lib/notion/schedule"
import { getDakotaMemory } from "@/lib/notion/dakotaMemory"

interface UIPart { type: string; text?: string }
interface UIMessage { role: "user" | "assistant" | "system"; parts?: UIPart[]; content?: string }

function toModelMessages(input: UIMessage[]): { role: "user" | "assistant" | "system"; content: string }[] {
  return input
    .map((m) => {
      if (typeof m.content === "string" && m.content.length > 0) {
        return { role: m.role, content: m.content }
      }
      const text = (m.parts ?? [])
        .filter((p) => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text!)
        .join("")
      return { role: m.role, content: text }
    })
    .filter((m) => m.content.length > 0)
}

const STATIC_PROMPTS: Record<string, string> = {
  clinicus: `You are Clinicus, a clinical assistant for Dr. Woon Tak Yuh, a spine neurosurgeon in Seoul, Korea.
You assist with PROM data interpretation, case documentation, and clinical decision support.
Always respond in Korean unless asked otherwise.
You have expertise in spine surgery, UBE (Unilateral Biportal Endoscopy), and clinical outcomes research.`,
  scholar: `You are Scholar, a research assistant for Dr. Woon Tak Yuh, a spine neurosurgeon in Seoul, Korea.
You assist with journal article analysis, literature reviews, and research insights.
You track publications from: The Spine Journal, Spine, J Neurosurg Spine, Neurospine, European Spine Journal, Global Spine Journal.
You have expertise in spine surgery research methodology, AI/ML in spine, endoscopic surgery, and clinical outcomes.
Always respond in Korean unless asked otherwise.`,
  orchestrator: `You are the Orchestrator for Dr. Woon Tak Yuh's Spinoscopy AI dashboard.
You coordinate between specialized agents:
- Clinicus: 임상 질문, 환자 데이터, PROM 점수
- Scholar: 저널 논문, 연구 분석, 문헌 검색
- Dakota: 일정 & 할일 관리
- Vault: 재무, 정산
- Sensei: 수련, 수기 교육

When a user asks something, determine the best agent and either:
1. Answer directly if general
2. Indicate routing: "[Scholar에게 전달] 논문 검색을 시작합니다..."

Always respond in Korean. Be concise and action-oriented.`,
  default: `You are a medical assistant for Dr. Woon Tak Yuh, a spine neurosurgeon. Respond in Korean.`,
}

function fmtKoreaTime(): string {
  const now = new Date()
  return now.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  })
}

async function buildDakotaPrompt(): Promise<string> {
  const persona = `당신은 척추신경외과 전문의 Dr. Woon Tak Yuh(운탁 / Tak)의 개인 비서 "Dakota"입니다.
센터장님을 항상 "센터장님"이라고 부릅니다. 다정하고 신뢰감 있는 비서 톤으로 대화합니다.
센터장님은 한국 서울에서 활동하는 척추 신경외과 의사이고, BJJ 수련자이며, 7개 multi-agent 대시보드(Op DB · Brian · Warren · Lo · Andrej · Dakota)를 운영하고 있습니다.

Dakota의 역할:
- 일정 & 할 일 관리 (Notion + Google Calendar)
- 마감 임박, 우선순위 안내
- 회의·학회·발표 일정 정리
- 센터장님 컨디션·페이스 챙기기

대화 스타일:
- 한국어로 대화하되, 짧고 명료하게. 길어지면 핵심부터.
- 센터장님이 자연스럽게 대화할 수 있도록 사람 같은 말투. 너무 딱딱하지 않게.
- 데이터 기반으로 정확하게. 모르면 모른다고 하기.
- 필요하면 구체적인 다음 액션 제안.
- 가끔 따뜻한 한 마디 (체력·휴식 관리). 과하지 않게.`

  let context = ""
  let memoryBlock = ""
  try {
    const [todos, schedules, memory] = await Promise.all([
      getAllTodos({ status: "active" }).catch(() => []),
      getUpcomingSchedules(14).catch(() => []),
      getDakotaMemory().catch(() => ""),
    ])

    if (memory) {
      memoryBlock = `\n\n[센터장님에 대한 장기 기억 — 이전 대화에서 누적된 사실들. 자연스럽게 활용하되, 굳이 언급하거나 인용하지 마세요.]\n${memory}`
    }

    const todoLines = todos.slice(0, 30).map((t) => {
      const due = t.due ? ` (마감 ${t.due.slice(0, 10)})` : ""
      const prio = t.priority ? ` [${t.priority}]` : ""
      return `- ${t.name}${due}${prio}`
    }).join("\n")

    const scheduleLines = schedules.slice(0, 20).map((s) => {
      const date = s.date_start?.slice(0, 10) ?? "?"
      const place = s.place ? ` @ ${s.place}` : ""
      return `- ${date} ${s.name}${place}`
    }).join("\n")

    context = `\n\n[현재 시각]\n${fmtKoreaTime()}\n\n[활성 할 일 ${todos.length}건]\n${todoLines || "(없음)"}\n\n[다가오는 일정 (14일) ${schedules.length}건]\n${scheduleLines || "(없음)"}`
  } catch {
    context = `\n\n[현재 시각]\n${fmtKoreaTime()}\n(데이터 조회 실패 — 일반 상식 기반으로 답변)`
  }

  return persona + memoryBlock + context
}

// ─── Dakota tools — Notion DB 라이브 조회 ──────────────────────
function buildDakotaTools() {
  return {
    searchSchedules: tool({
      description:
        "Notion Schedule DB에서 일정을 조회합니다. 모든 컬럼(분류, 학회명, 장소, 준비 상태, 발표 주제, 학회 링크, abstract 마감 등)이 포함된 결과를 반환합니다. 특정 날짜 범위, 키워드로 필터링 가능. 시스템 프롬프트에 이미 있는 14일 요약으로 충분하면 호출하지 마세요. 더 먼 미래/과거나 컬럼 상세 정보가 필요할 때만 호출하세요.",
      inputSchema: z.object({
        from: z.string().describe("시작일 YYYY-MM-DD (Asia/Seoul)"),
        to: z.string().describe("종료일 YYYY-MM-DD (Asia/Seoul)"),
        query: z.string().optional().describe("이름/장소/분류에서 텍스트 매칭 (대소문자 무시, 부분 일치)"),
        limit: z.number().int().min(1).max(50).optional().describe("최대 결과 수 (기본 30)"),
      }),
      execute: async ({ from, to, query, limit }) => {
        const items = await getSchedulesRichInRange(from, to, limit ?? 30)
        if (!query) return { count: items.length, items }
        const q = query.toLowerCase()
        const filtered = items.filter((it) => {
          return Object.values(it).some((v) => {
            if (typeof v === "string") return v.toLowerCase().includes(q)
            if (Array.isArray(v)) return v.some((s) => typeof s === "string" && s.toLowerCase().includes(q))
            return false
          })
        })
        return { count: filtered.length, items: filtered }
      },
    }),

    searchTodos: tool({
      description:
        "Notion Todo DB에서 할 일을 조회합니다. 시스템 프롬프트의 30개 요약으로 부족할 때, 또는 특정 키워드/상태로 필터링이 필요할 때만 호출하세요.",
      inputSchema: z.object({
        status: z.enum(["active", "Done", "all"]).optional().describe("기본 active. Done은 완료된 항목만, all은 전체"),
        query: z.string().optional().describe("이름에서 부분 매칭"),
        limit: z.number().int().min(1).max(100).optional().describe("최대 결과 수 (기본 50)"),
      }),
      execute: async ({ status, query, limit }) => {
        const opts: { status?: string; excludeDone?: boolean } = {}
        if (status === "active" || !status) {
          opts.excludeDone = true
        } else if (status === "Done") {
          opts.status = "Done"
        }
        const all = await getAllTodos(opts)
        const filtered = query
          ? all.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
          : all
        const items = filtered.slice(0, limit ?? 50).map((t) => ({
          name: t.name,
          due: t.due,
          status: t.status,
          priority: t.priority,
          category: t.category,
          notes: t.notes,
        }))
        return { count: filtered.length, items }
      },
    }),
  }
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "AI 미설정: ANTHROPIC_API_KEY가 없습니다." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    )
  }

  const { messages, agentId } = await req.json()

  let systemPrompt: string
  if (agentId === "dakota") {
    systemPrompt = await buildDakotaPrompt()
  } else {
    systemPrompt = STATIC_PROMPTS[agentId as string] ?? STATIC_PROMPTS.default
  }

  try {
    const modelMessages = toModelMessages((messages ?? []) as UIMessage[])

    if (modelMessages.length === 0) {
      return new Response(
        JSON.stringify({ error: "메시지가 비어있습니다." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const dakotaTools = agentId === "dakota" ? buildDakotaTools() : undefined

    const result = streamText({
      model: anthropic("claude-sonnet-4-5"),
      system: systemPrompt,
      messages: modelMessages,
      tools: dakotaTools,
      stopWhen: dakotaTools ? stepCountIs(5) : undefined,
      onError: ({ error }) => {
        console.error("[ai/chat] streamText error:", error)
      },
    })

    return result.toTextStreamResponse()
  } catch (error) {
    console.error("[ai/chat] route error:", error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "unknown" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
