import { anthropic } from "@ai-sdk/anthropic"
import { streamText, stepCountIs, tool } from "ai"
import { z } from "zod"
import { getAllTodos } from "@/lib/notion/todo"
import { getUpcomingSchedules, getSchedulesRichInRange } from "@/lib/notion/schedule"
import { getDakotaMemory } from "@/lib/notion/dakotaMemory"
import { listResearchProjects } from "@/lib/notion/research"
import { getJournalStats } from "@/lib/notion/journal"
import { getAllPatientRows } from "@/lib/notion/analytics"

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

const ORCHESTRATOR_BLOCK = `

[Orchestrator 역할]
센터장님은 7개 multi-agent 대시보드를 운영하고 계시고, Dakota는 그중 비서 역할이자 다른 agent들에게 정보를 요청해 답을 종합할 수 있는 orchestrator입니다.
다른 agent의 데이터가 필요할 때는 아래 도구를 호출해 직접 가져오세요:
- askBrian: 논문 통계 + 진행 중인 연구 프로젝트 (Scholar)
- askLo: BJJ 수련 스탯 (Sensei)
- askOpDB: 환자 케이스 요약 (Clinicus)
한 응답에서 여러 agent에 동시에 물어봐도 됩니다. 결과를 받으면 센터장님께 비서 톤으로 종합해서 답하세요.`

async function getInternalBaseUrl(req: Request): Promise<string> {
  const url = new URL(req.url)
  return `${url.protocol}//${url.host}`
}

// ─── Dakota tools — Notion DB 라이브 조회 + 다른 agent orchestration ──
function buildDakotaTools(req: Request) {
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

    askBrian: tool({
      description:
        "Brian(Scholar agent)에게 논문/연구 정보를 물어봅니다. 저널 통계와 현재 진행 중인 연구 프로젝트(상태별 분류)를 반환합니다. 센터장님이 '논문', 'paper', '연구', 'submit', '저널' 등을 언급하면 호출하세요.",
      inputSchema: z.object({}),
      execute: async () => {
        const [stats, projects] = await Promise.all([
          getJournalStats().catch(() => null),
          listResearchProjects().catch(() => []),
        ])
        const byStatus: Record<string, number> = {}
        for (const p of projects) {
          byStatus[p.status] = (byStatus[p.status] ?? 0) + 1
        }
        const recentProjects = projects.slice(0, 15).map((p) => ({
          title: p.title,
          status: p.status,
          target_journal: p.target_journal,
          start_date: p.start_date,
        }))
        return {
          journal: stats,
          research_total: projects.length,
          research_by_status: byStatus,
          recent_projects: recentProjects,
        }
      },
    }),

    askLo: tool({
      description:
        "Lo(Sensei agent)에게 BJJ 수련 통계를 물어봅니다. 센터장님이 'BJJ', '주짓수', '훈련', '매트', '연속' 등을 언급하면 호출하세요.",
      inputSchema: z.object({}),
      execute: async () => {
        const baseUrl = await getInternalBaseUrl(req)
        try {
          const res = await fetch(`${baseUrl}/api/notion/sensei/stats`, {
            cache: "no-store",
          })
          if (!res.ok) return { error: "조회 실패" }
          const data = await res.json()
          return data
        } catch (e) {
          return { error: e instanceof Error ? e.message : "unknown" }
        }
      },
    }),

    askOpDB: tool({
      description:
        "Op DB(Clinicus agent)에게 환자 케이스 요약을 물어봅니다. 센터장님이 '환자', '수술', '케이스', 'PROM' 등을 언급하면 호출하세요. 누적 환자 수와 최근 1주일 새 케이스 수를 반환합니다.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const data = await getAllPatientRows()
          const total = data.patients.length
          const now = new Date()
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
          const recent_week = data.patients.filter((p) => p.op_date && p.op_date.slice(0, 10) >= weekAgo).length
          const recent_month = data.patients.filter((p) => p.op_date && p.op_date.slice(0, 10) >= monthAgo).length
          return { total, recent_week, recent_month }
        } catch (e) {
          return { error: e instanceof Error ? e.message : "unknown" }
        }
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
    systemPrompt = (await buildDakotaPrompt()) + ORCHESTRATOR_BLOCK
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

    const dakotaTools = agentId === "dakota" ? buildDakotaTools(req) : undefined

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
