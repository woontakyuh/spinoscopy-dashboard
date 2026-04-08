import { anthropic } from "@ai-sdk/anthropic"
import { streamText, stepCountIs, tool } from "ai"
import { z } from "zod"
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"
import { getAllTodos, createTodo, updateTodo, deleteTodo } from "@/lib/notion/todo"
import { getUpcomingSchedules, getSchedulesRichInRange, createSchedule, updateSchedule, deleteSchedule } from "@/lib/notion/schedule"
import {
  getMemoryDigest,
  createMemory,
  updateMemory,
  listMemories,
  type MemoryCategory,
} from "@/lib/notion/dakotaMemoryV2"
import { listResearchProjects } from "@/lib/notion/research"
import { getJournalStats } from "@/lib/notion/journal"
import { getAllPatientRows } from "@/lib/notion/analytics"
import {
  listGoogleCalendarEventsForRange,
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
} from "@/lib/google/calendar"

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

// DAKOTA.md 캐싱 (서버 부팅 후 한 번만 디스크에서 읽음)
let cachedPersona: string | null = null
function loadDakotaPersona(): string {
  if (cachedPersona !== null) return cachedPersona
  try {
    const persona = readFileSync(path.join(process.cwd(), "DAKOTA.md"), "utf-8")
    cachedPersona = persona
    return persona
  } catch {
    cachedPersona = ""
    return ""
  }
}

async function buildDakotaPrompt(): Promise<string> {
  const persona = loadDakotaPersona() || `당신은 척추신경외과 전문의 Dr. Woon Tak Yuh의 개인 비서 Dakota입니다. 센터장님이라 부르고, 다정하고 신뢰감 있는 비서 톤으로 한국어로 대화합니다.`

  let context = ""
  let memoryBlock = ""
  try {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
    const in14 = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }))
    in14.setDate(in14.getDate() + 14)
    const in14Str = in14.toLocaleDateString("en-CA")

    const [todos, notionSchedules, gcalEvents, memoryDigest] = await Promise.all([
      getAllTodos({ status: "active" }).catch(() => []),
      getUpcomingSchedules(14).catch(() => []),
      listGoogleCalendarEventsForRange(today, in14Str).catch(() => []),
      getMemoryDigest(40).catch(() => ""),
    ])

    if (memoryDigest) {
      memoryBlock = `\n\n[Dakota Memory — Notion DB에 저장된 센터장님 사실들. 자연스럽게 활용하되 굳이 언급하지 마세요. 새 사실 발견 시 add_memory 도구로 저장하세요.]\n${memoryDigest}`
    }

    const todoLines = todos.slice(0, 30).map((t) => {
      const due = t.due ? ` (마감 ${t.due.slice(0, 10)})` : ""
      const prio = t.priority ? ` [${t.priority}]` : ""
      return `- ${t.name}${due}${prio}`
    }).join("\n")

    // Notion + Google Calendar 일정을 통합 정렬
    interface MergedEvent { date: string; title: string; place: string; source: "notion" | "gcal" }
    const merged: MergedEvent[] = []
    for (const s of notionSchedules) {
      merged.push({
        date: s.date_start?.slice(0, 10) ?? "?",
        title: s.name,
        place: s.place ?? "",
        source: "notion",
      })
    }
    for (const e of gcalEvents) {
      merged.push({
        date: (e.start ?? "").slice(0, 10) || "?",
        title: e.title,
        place: e.location ?? "",
        source: "gcal",
      })
    }
    merged.sort((a, b) => a.date.localeCompare(b.date))

    const scheduleLines = merged.slice(0, 30).map((m) => {
      const place = m.place ? ` @ ${m.place}` : ""
      const tag = m.source === "gcal" ? " [GCal]" : " [Notion]"
      return `- ${m.date} ${m.title}${place}${tag}`
    }).join("\n")

    context = `\n\n[현재 시각]\n${fmtKoreaTime()}\n\n[활성 할 일 ${todos.length}건]\n${todoLines || "(없음)"}\n\n[다가오는 일정 14일 (Notion ${notionSchedules.length}건 + GCal ${gcalEvents.length}건)]\n${scheduleLines || "(없음)"}`
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
        "Schedule를 조회합니다. Notion Schedule DB(학회·발표·분류·장소·발표 주제 등 모든 컬럼) + Google Calendar(개인 일정·미팅·예약 등) 둘 다 합쳐서 반환합니다. 날짜 범위 필수, 키워드는 옵션. 시스템 프롬프트의 14일 요약으로 부족할 때만 호출하세요.",
      inputSchema: z.object({
        from: z.string().describe("시작일 YYYY-MM-DD (Asia/Seoul)"),
        to: z.string().describe("종료일 YYYY-MM-DD (Asia/Seoul)"),
        query: z.string().optional().describe("이름/장소/분류에서 텍스트 매칭 (대소문자 무시, 부분 일치)"),
        limit: z.number().int().min(1).max(50).optional().describe("최대 결과 수 (기본 30)"),
      }),
      execute: async ({ from, to, query, limit }) => {
        const [notionItems, gcalItems] = await Promise.all([
          getSchedulesRichInRange(from, to, limit ?? 30).catch(() => []),
          listGoogleCalendarEventsForRange(from, to).catch(() => []),
        ])
        const filterFn = (str: string | undefined) => !query || (str ?? "").toLowerCase().includes(query.toLowerCase())
        const notionFiltered = query
          ? notionItems.filter((it) =>
              Object.values(it).some((v) => {
                if (typeof v === "string") return filterFn(v)
                if (Array.isArray(v)) return v.some((s) => typeof s === "string" && filterFn(s))
                return false
              })
            )
          : notionItems
        const gcalFiltered = query
          ? gcalItems.filter((e) => filterFn(e.title) || filterFn(e.location))
          : gcalItems
        return {
          notion_count: notionFiltered.length,
          gcal_count: gcalFiltered.length,
          notion: notionFiltered,
          gcal: gcalFiltered.map((e) => ({
            title: e.title,
            start: e.start,
            end: e.end,
            location: e.location,
            url: e.url,
          })),
        }
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

    add_todo: tool({
      description:
        "센터장님의 Notion Todo DB에 새 할 일을 추가합니다. 사용자가 '할 일 추가해줘' 또는 명확히 새 task를 요청할 때 호출.",
      inputSchema: z.object({
        name: z.string().min(1).max(200).describe("할 일 제목"),
        due: z.string().optional().describe("마감일 YYYY-MM-DD"),
        priority: z.enum(["High", "Medium", "Low"]).optional().describe("기본 Medium"),
        category: z.string().optional().describe("일상업무, 가족, 학회, 연구, 임상, AI 등"),
        notes: z.string().optional(),
      }),
      execute: async ({ name, due, priority, category, notes }) => {
        const result = await createTodo({ name, due, priority, category, notes })
        return { ok: true, page_id: result.page_id, url: result.url }
      },
    }),

    update_todo: tool({
      description:
        "기존 할 일을 수정합니다. 이름·마감일·상태·우선순위·카테고리 변경 가능. 완료 처리는 status='Done'.",
      inputSchema: z.object({
        page_id: z.string().describe("할 일 page_id (먼저 searchTodos로 찾기)"),
        name: z.string().optional(),
        due: z.union([z.string(), z.null()]).optional().describe("YYYY-MM-DD 또는 null로 지움"),
        status: z.string().optional().describe("To Do, In Progress, Done 등"),
        priority: z.enum(["High", "Medium", "Low"]).optional(),
        category: z.string().optional(),
        notes: z.string().optional(),
      }),
      execute: async (input) => {
        await updateTodo(input.page_id, {
          name: input.name,
          due: input.due,
          status: input.status,
          priority: input.priority,
          category: input.category,
          notes: input.notes,
        })
        return { ok: true }
      },
    }),

    delete_todo: tool({
      description: "할 일을 archive 처리 (완전 삭제 아닌 보관)",
      inputSchema: z.object({ page_id: z.string() }),
      execute: async ({ page_id }) => {
        await deleteTodo(page_id)
        return { ok: true }
      },
    }),

    update_schedule: tool({
      description:
        "기존 Notion Schedule DB row를 수정합니다. 이름·날짜·장소·분류·학회명·발표 주제·링크 등 변경 가능. page_id는 searchSchedules로 먼저 찾아야 합니다.",
      inputSchema: z.object({
        page_id: z.string().describe("Notion page_id"),
        name: z.string().optional(),
        date_start: z.string().optional().describe("YYYY-MM-DD 또는 ISO"),
        date_end: z.union([z.string(), z.null()]).optional(),
        place: z.union([z.string(), z.null()]).optional(),
        category: z.union([z.string(), z.null()]).optional(),
        society: z.array(z.string()).optional(),
        topic: z.union([z.string(), z.null()]).optional(),
        link: z.union([z.string(), z.null()]).optional(),
      }),
      execute: async (input) => {
        await updateSchedule(input.page_id, {
          name: input.name,
          date_start: input.date_start,
          date_end: input.date_end,
          place: input.place,
          category: input.category,
          society: input.society,
          topic: input.topic,
          link: input.link,
        })
        return { ok: true }
      },
    }),

    delete_schedule: tool({
      description: "Notion Schedule row를 archive (보관 처리). 완전 삭제 아님.",
      inputSchema: z.object({ page_id: z.string() }),
      execute: async ({ page_id }) => {
        await deleteSchedule(page_id)
        return { ok: true }
      },
    }),

    update_gcal_event: tool({
      description:
        "Google Calendar 이벤트를 수정합니다. event_id는 searchSchedules의 gcal 결과에서 'id' 필드로 얻을 수 있습니다. 이름·날짜·장소 변경 가능.",
      inputSchema: z.object({
        event_id: z.string(),
        name: z.string().optional(),
        date_start: z.string().optional().describe("YYYY-MM-DD 또는 ISO"),
        date_end: z.string().optional(),
        place: z.union([z.string(), z.null()]).optional(),
        description: z.union([z.string(), z.null()]).optional(),
      }),
      execute: async (input) => {
        const result = await updateGoogleCalendarEvent({
          eventId: input.event_id,
          name: input.name,
          date_start: input.date_start,
          date_end: input.date_end,
          place: input.place,
          description: input.description,
        })
        return result
      },
    }),

    delete_gcal_event: tool({
      description: "Google Calendar 이벤트 삭제",
      inputSchema: z.object({ event_id: z.string() }),
      execute: async ({ event_id }) => {
        const result = await deleteGoogleCalendarEvent(event_id)
        return result
      },
    }),

    create_schedule: tool({
      description:
        "일정을 생성합니다. targets로 어디에 만들지 지정 — ['notion'] / ['gcal'] / ['notion','gcal'] 중 선택. 학회·발표·미팅·약속 등 추가에 사용.",
      inputSchema: z.object({
        name: z.string().min(1).describe("일정 이름"),
        date_start: z.string().describe("시작일 YYYY-MM-DD 또는 ISO 시간"),
        date_end: z.string().optional().describe("종료일 YYYY-MM-DD"),
        place: z.string().optional(),
        category: z.string().optional().describe("학회, 회의, 강의 등 (Notion 전용)"),
        topic: z.string().optional().describe("발표 주제 (Notion 전용)"),
        link: z.string().optional(),
        targets: z
          .array(z.enum(["notion", "gcal"]))
          .optional()
          .describe("기본 ['notion','gcal']. GCal 단독: ['gcal']. Notion 단독: ['notion']"),
      }),
      execute: async (input) => {
        const targets = input.targets ?? ["notion", "gcal"]
        const out: Record<string, unknown> = {}

        if (targets.includes("notion")) {
          try {
            const r = await createSchedule({
              name: input.name,
              date_start: input.date_start,
              date_end: input.date_end,
              place: input.place,
              category: input.category,
              topic: input.topic,
              link: input.link,
            })
            out.notion = { ok: true, ...r }
          } catch (e) {
            out.notion = { ok: false, error: e instanceof Error ? e.message : "fail" }
          }
        }

        if (targets.includes("gcal")) {
          try {
            const r = await createGoogleCalendarEvent({
              name: input.name,
              date_start: input.date_start,
              date_end: input.date_end,
              place: input.place,
            })
            out.gcal = r
          } catch (e) {
            out.gcal = { success: false, message: e instanceof Error ? e.message : "fail" }
          }
        }

        return out
      },
    }),

    add_memory: tool({
      description:
        "Dakota Memory DB에 새 사실을 저장합니다. 센터장님이 '기억해줘'라고 명시했거나, 대화 중 장기적으로 가치 있는 사실을 발견했을 때 호출하세요. 일회성 잡담·인사·날씨는 저장하지 마세요. 카테고리는 7개 중 가장 알맞은 것 선택.",
      inputSchema: z.object({
        name: z.string().max(100).describe("짧은 키 (예: 'AANS submission 마감')"),
        category: z.enum(["profile", "preference", "person", "project", "rule", "fact", "event"]),
        content: z.string().max(1500).describe("실제 사실 내용"),
        importance: z.number().int().min(1).max(5).describe("1=일시적, 5=핵심"),
      }),
      execute: async ({ name, category, content, importance }) => {
        const row = await createMemory({ name, category: category as MemoryCategory, content, importance })
        return { ok: true, page_id: row.page_id, name: row.name }
      },
    }),

    update_memory: tool({
      description:
        "기존 Dakota Memory row를 수정합니다. 모순되는 새 정보가 들어오거나, 학회 임기 변경 등 사실 갱신 시 사용. page_id는 query_memory로 먼저 찾아야 합니다.",
      inputSchema: z.object({
        page_id: z.string().describe("수정할 row의 Notion page_id"),
        name: z.string().max(100).optional(),
        category: z.enum(["profile", "preference", "person", "project", "rule", "fact", "event"]).optional(),
        content: z.string().max(1500).optional(),
        importance: z.number().int().min(1).max(5).optional(),
        status: z.enum(["active", "archived"]).optional(),
      }),
      execute: async (input) => {
        await updateMemory({
          pageId: input.page_id,
          name: input.name,
          category: input.category as MemoryCategory | undefined,
          content: input.content,
          importance: input.importance,
          status: input.status,
        })
        return { ok: true }
      },
    }),

    query_memory: tool({
      description:
        "Dakota Memory DB에서 특정 카테고리/중요도의 사실을 조회합니다. 시스템 프롬프트에 기본으로 들어간 digest로 부족할 때만 호출.",
      inputSchema: z.object({
        category: z.enum(["profile", "preference", "person", "project", "rule", "fact", "event"]).optional(),
        min_importance: z.number().int().min(1).max(5).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ category, min_importance, limit }) => {
        const rows = await listMemories({
          category: category as MemoryCategory | undefined,
          minImportance: min_importance,
          limit,
        })
        return {
          count: rows.length,
          rows: rows.map((r) => ({
            page_id: r.page_id,
            name: r.name,
            category: r.category,
            content: r.content,
            importance: r.importance,
          })),
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
