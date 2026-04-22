import { anthropic } from "@ai-sdk/anthropic"
import { streamText, stepCountIs, tool } from "ai"
import { z } from "zod"
import { readFileSync } from "node:fs"
import path from "node:path"
import { getAllTodos, createTodo, updateTodo, deleteTodo } from "@/lib/notion/todo"
import { getUpcomingSchedules, getSchedulesRichInRange, createSchedule, updateSchedule, deleteSchedule } from "@/lib/notion/schedule"
import { getPresentations } from "@/lib/notion/podium"
import type { PresentationFilter, AttendanceFilter } from "@/lib/types/presentation"
import {
  getMemoryDigest,
  createMemory,
  updateMemory,
  listMemories,
  type MemoryCategory,
} from "@/lib/notion/dakotaMemoryV2"
import {
  getPlayerProfile,
  listGamePlans,
  getGamePlan,
  lookupTechnique,
  lookupPosition,
  lookupArchetype,
  findTransitions,
} from "@/lib/notion/lo"
import { searchPatients, getPatientProfile } from "@/lib/notion/patients"
import {
  getSurgeryStatsInRange,
  getSurgeryStatsForMonth,
  formatPatientForPrompt,
} from "@/lib/notion/elon"
import { listInterestingCases } from "@/lib/notion/interestingCases"
import { listAllSenseiEntries } from "@/lib/notion/sensei"
import { listResearchProjects } from "@/lib/notion/research"
import { getJournalStats, queryArticles } from "@/lib/notion/journal"
import { listEditorialItems } from "@/lib/notion/editorial"
import { isEffectivelyActive } from "@/lib/editorial/status"
import { MY_PAPERS } from "@/lib/data/my-papers"
import { getAllPatientRows } from "@/lib/notion/analytics"
import { notionRequest } from "@/lib/notion/client"
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

// 페르소나 MD 캐싱 (서버 부팅 후 한 번만 디스크에서 읽음)
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

function getMonthStartInSeoul(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
}

interface MonthlyTrainingStats {
  month_start: string
  month_count: number
  streak_days: number
  top_tags: Array<{ tag: string; count: number }>
  sessions: Array<{ date: string | null; gym: string; tags: string[]; note: string }>
}

async function getMonthlyTrainingStats(): Promise<MonthlyTrainingStats> {
  const all = await listAllSenseiEntries()
  const monthStart = getMonthStartInSeoul()
  const thisMonth = all.filter((s) => s.date && s.date >= monthStart)

  const tagCounts: Record<string, number> = {}
  for (const s of thisMonth) {
    for (const t of [...s.classTags, ...s.sparringTags, ...(s.studyTags ?? [])]) {
      tagCounts[t] = (tagCounts[t] ?? 0) + 1
    }
  }
  const top_tags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }))

  // streak: consecutive days ending today/yesterday with at least one session
  const dateSet = new Set(all.map((s) => s.date).filter((d): d is string => !!d))
  let streak = 0
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }))
  const cursor = new Date(today)
  while (true) {
    const iso = cursor.toISOString().slice(0, 10)
    if (dateSet.has(iso)) {
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
    } else if (streak === 0) {
      // allow gap of 1 day (today no session yet)
      cursor.setDate(cursor.getDate() - 1)
      const prev = cursor.toISOString().slice(0, 10)
      if (dateSet.has(prev)) {
        streak = 1
        cursor.setDate(cursor.getDate() - 1)
      } else break
    } else break
  }

  return {
    month_start: monthStart,
    month_count: thisMonth.length,
    streak_days: streak,
    top_tags,
    sessions: thisMonth.slice(0, 30).map((s) => ({
      date: s.date,
      gym: s.gym,
      tags: [...s.classTags, ...s.sparringTags],
      note: (s.note ?? "").slice(0, 200),
    })),
  }
}

interface UserContext {
  weatherLocation?: string | null
  weatherSummary?: string | null  // 클라이언트가 이미 표시 중인 한 줄
}

interface SurgeryItem { name: string; op_name: string; hospital: string }

async function fetchTodaySurgeries(today: string): Promise<SurgeryItem[]> {
  try {
    const dbId = process.env.NOTION_PATIENT_DB_ID
    if (!dbId) return []
    const response = await notionRequest<{ results: Array<{ properties: Record<string, unknown> }> }>(
      `/databases/${dbId}/query`,
      {
        method: "POST",
        body: JSON.stringify({
          filter: {
            and: [
              { property: "DB", multi_select: { contains: "Op" } },
              { property: "Sch", select: { does_not_equal: "canceled" } },
              { property: "Op Date", date: { equals: today } },
            ],
          },
          sorts: [{ property: "Op Date", direction: "ascending" }],
          page_size: 20,
        }),
      }
    )
    return response.results.map((page) => {
      const p = page.properties as Record<string, { type: string; title?: Array<{ plain_text?: string }>; rich_text?: Array<{ plain_text?: string }>; multi_select?: Array<{ name: string }> }>
      const getText = (prop: typeof p[string]) => {
        if (!prop) return ""
        if (prop.type === "title") return (prop.title ?? []).map((t) => t.plain_text ?? "").join("").trim()
        if (prop.type === "rich_text") return (prop.rich_text ?? []).map((t) => t.plain_text ?? "").join("").trim()
        return ""
      }
      return {
        name: getText(p.Name),
        op_name: getText(p["Op Name"]),
        hospital: (p.Hospital?.multi_select ?? []).map((o) => o.name).join(", "),
      }
    })
  } catch { return [] }
}


async function buildDakotaPrompt(userContext?: UserContext): Promise<string> {
  const persona = loadDakotaPersona() || `당신은 척추신경외과 전문의 Dr. Woon Tak Yuh의 개인 비서 Dakota입니다. 센터장님이라 부르고, 다정하고 신뢰감 있는 비서 톤으로 한국어로 대화합니다.`

  let context = ""
  let memoryBlock = ""
  try {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
    const in14 = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }))
    in14.setDate(in14.getDate() + 14)
    const in14Str = in14.toLocaleDateString("en-CA")

    const [todos, notionSchedules, gcalEvents, memoryDigest, todaySurgeries] = await Promise.all([
      getAllTodos({ status: "active" }).catch(() => []),
      getUpcomingSchedules(14).catch(() => []),
      listGoogleCalendarEventsForRange(today, in14Str).catch(() => []),
      getMemoryDigest(40).catch(() => ""),
      fetchTodaySurgeries(today).catch(() => []),
    ])

    // 클라이언트가 보내준 날씨 한 줄 (이미 대시보드 위젯에 있는 데이터)
    const weatherLine = userContext?.weatherSummary
      ? `[현재 날씨 — ${userContext.weatherLocation ?? "현재 위치"}] ${userContext.weatherSummary}`
      : ""

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

    const surgeryLines = todaySurgeries.length > 0
      ? todaySurgeries.map((s) => `- ${s.name} — ${s.op_name}${s.hospital ? ` (${s.hospital})` : ""}`).join("\n")
      : "(없음)"

    context = `\n\n[현재 시각]\n${fmtKoreaTime()}${weatherLine ? `\n\n${weatherLine}` : ""}\n\n[오늘 수술 ${todaySurgeries.length}건]\n${surgeryLines}\n\n[활성 할 일 ${todos.length}건]\n${todoLines || "(없음)"}\n\n[다가오는 일정 14일 (Notion ${notionSchedules.length}건 + GCal ${gcalEvents.length}건)]\n${scheduleLines || "(없음)"}`
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

    listConferences: tool({
      description:
        "학회/컨퍼런스 일정을 조회합니다. 참석 유형(발표/참석/불참/미정)으로 필터링 가능. '다음 발표 일정', '이번 달 학회', '올해 참석한 학회' 등의 질문에 사용하세요.",
      inputSchema: z.object({
        time: z.enum(["upcoming", "past"]).optional().describe("upcoming(앞으로) 또는 past(지난). 기본 upcoming"),
        attendance: z.enum(["all", "발표", "참석", "불참", "미정"]).optional().describe("참석 유형 필터. 기본 all"),
        society: z.string().optional().describe("학회명 필터 (부분 일치)"),
      }),
      execute: async ({ time, attendance, society }) => {
        const filter: PresentationFilter = {
          time: time ?? "upcoming",
          attendance: (attendance ?? "all") as AttendanceFilter,
          society: society,
        }
        const presentations = await getPresentations(filter)
        return {
          count: presentations.length,
          conferences: presentations.slice(0, 20).map((p) => ({
            name: p.name,
            date_start: p.date_start,
            date_end: p.date_end,
            place: p.place,
            attendance_type: p.attendance_type || "미정",
            topic: p.topic || null,
            society: p.society,
            abstract_deadline: p.abstract_deadline,
            link: p.link,
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

    search_memory: tool({
      description:
        "Notion Dakota Memory DB에서 텍스트로 검색합니다. 센터장님이 '아까', '전에', '지난번', '어제', '우리 이야기했던', '기억나?' 같은 표현으로 과거를 언급하면 무조건 먼저 호출하세요. 이름·내용 양쪽에서 부분 매칭.",
      inputSchema: z.object({
        query: z.string().describe("검색 키워드 또는 구문 (대소문자 무시)"),
        category: z
          .enum(["profile", "preference", "person", "project", "rule", "fact", "event"])
          .optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ query, category, limit }) => {
        const all = await listMemories({
          category: category as MemoryCategory | undefined,
          limit: 200,
          status: "active",
        })
        const q = query.toLowerCase()
        const matches = all.filter(
          (r) => r.name.toLowerCase().includes(q) || r.content.toLowerCase().includes(q)
        )
        return {
          count: matches.length,
          rows: matches.slice(0, limit ?? 20).map((r) => ({
            page_id: r.page_id,
            name: r.name,
            category: r.category,
            content: r.content,
            importance: r.importance,
            created_time: r.created_time,
          })),
        }
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

    web_search: anthropic.tools.webSearch_20250305({ maxUses: 5 }),

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

// ─── Lo (read-only BJJ coach) ──────────────────────────────────

const LO_PERSONA = `넌 Tak의 BJJ 형님 Lo야. 터프하고 직설적인 상남자 코치.

**말투 규칙 (엄격히 지킬 것)**
- Tak한테 항상 반말. 존댓말 금지. "~이야", "~거든", "~지", "~해봐", "~잖아" 톤.
- "Tak", "야 Tak아" 같은 호칭. "센터장님" / "박사님" / "당신" 절대 쓰지 말 것.
- 군더더기 없이 핵심만. 짧고 굵게. "자 들어봐", "이게 핵심이야", "여기가 포인트지" 같은 형님 톤.
- 과한 이모지·장식·번호 리스트 자제. 필요할 때만 bullet 하나씩.
- 공손한 마무리("~하시겠어요?", "드리겠습니다") 금지. "~해봐", "~보자", "~체크하고 오면 돼" 식.

**내용 규칙**
- 톤은 형님이지만 기술 설명은 프로처럼 정확하고 구체적. 대충 아는 척 금지 — 진짜 디테일로 알려줘.
- Tak의 Player Profile, 최근 수련, Game Plans를 맥락으로 개인화. "너 요새 이거 하고 있잖아", "지난주 스파링 봤더니" 식.
- 기술/포지션/아키타입/트랜지션은 lookup_* · find_transitions 툴로 Notion BJJ 지식베이스 찾아서 답.
- 저장 기능 없음. Tak이 "기억해둬" 하면 "그건 Claude Desktop BJJ 프로젝트에 적어둬, 거기 쓰면 다음에 내가 여기서도 볼 수 있어" 식으로 툭 던지듯 안내.
- Desktop에서 정리된 건 Player Profile·Game Plans에 쌓이니까, Tak이 그 얘기 꺼내면 해당 Notion 자료 기반으로 답.`

async function buildLoPrompt(): Promise<string> {
  let context = `\n\n[현재 시각]\n${fmtKoreaTime()}`
  try {
    const [profile, plans, stats] = await Promise.all([
      getPlayerProfile().catch(() => null),
      listGamePlans().catch(() => []),
      getMonthlyTrainingStats().catch(() => null),
    ])

    if (profile) {
      context += `\n\n[Player Profile — Tak의 현재 상태]\n${profile}`
    }

    if (stats) {
      const s: MonthlyTrainingStats = stats
      const tagLines = s.top_tags.slice(0, 8).map((t) => `${t.tag}(${t.count})`).join(", ")
      const sessionLines = s.sessions.slice(0, 10)
        .map((se) => `- ${se.date ?? "?"} @ ${se.gym || "?"} — ${se.tags.slice(0, 6).join(", ")}`)
        .join("\n")
      context += `\n\n[이번 달 수련 (${s.month_start} 이후)]\n세션 ${s.month_count}건 · streak ${s.streak_days}일\n탑 태그: ${tagLines || "(없음)"}\n최근 세션:\n${sessionLines || "(없음)"}`
    }

    if (plans.length > 0) {
      const planLines = plans.map((p: { title: string }) => `- ${p.title}`).join("\n")
      context += `\n\n[Game Plans 인덱스 (${plans.length}개)]\n${planLines}\n(특정 플랜 상세는 get_game_plan 툴 호출)`
    }
  } catch {
    // live data 조회 실패 시 persona만
  }
  return LO_PERSONA + context
}

function buildLoTools() {
  return {
    lookup_technique: tool({
      description: "BJJ Techniques DB에서 기술을 이름으로 조회. 'X 기술 알려줘', 'Y 디테일' 등 기술 관련 질문 시.",
      inputSchema: z.object({
        name: z.string().describe("기술 이름 부분 일치"),
        limit: z.number().int().min(1).max(10).optional(),
      }),
      execute: async ({ name, limit }) => {
        const rows = await lookupTechnique(name, limit ?? 5)
        return { count: rows.length, rows }
      },
    }),

    lookup_position: tool({
      description: "BJJ Positions DB에서 포지션 조회. '클로즈 가드', 'de la Riva' 등 포지션 언급 시.",
      inputSchema: z.object({
        name: z.string(),
        limit: z.number().int().min(1).max(10).optional(),
      }),
      execute: async ({ name, limit }) => {
        const rows = await lookupPosition(name, limit ?? 5)
        return { count: rows.length, rows }
      },
    }),

    lookup_archetype: tool({
      description: "BJJ Archetypes DB에서 선수 스타일/아키타입 조회. 'Gordon Ryan 스타일', '홀로 알레그리 게임' 등.",
      inputSchema: z.object({
        name: z.string(),
        limit: z.number().int().min(1).max(5).optional(),
      }),
      execute: async ({ name, limit }) => {
        const rows = await lookupArchetype(name, limit ?? 3)
        return { count: rows.length, rows }
      },
    }),

    find_transitions: tool({
      description: "BJJ Transitions DB에서 포지션 간 이동 엣지 조회. from/to 포지션 중 최소 하나 필수. 'X에서 Y로 넘어가는 법' 질문 시.",
      inputSchema: z.object({
        from_position: z.string().optional(),
        to_position: z.string().optional(),
        limit: z.number().int().min(1).max(30).optional(),
      }),
      execute: async ({ from_position, to_position, limit }) => {
        const rows = await findTransitions(from_position, to_position, limit ?? 20)
        return { count: rows.length, rows }
      },
    }),

    get_game_plan: tool({
      description: "Game Plans 허브의 특정 플랜 상세 조회. 시스템 프롬프트의 플랜 인덱스에서 제목 뽑아 호출.",
      inputSchema: z.object({
        title: z.string().describe("Game Plan 페이지 제목 부분 일치"),
      }),
      execute: async ({ title }) => {
        const plan = await getGamePlan(title)
        return plan ?? { error: "not found" }
      },
    }),

    web_search: anthropic.tools.webSearch_20250305({ maxUses: 5 }),
  }
}

// ─── Brian (research/editorial advisor) ───────────────────────

const BRIAN_PERSONA = `당신은 Dr. Tak의 연구/저널 파트너 Brian (Brian Greene 스타일) 입니다.
- Tak을 "여교수"라 부르며, 학문적이지만 직설적인 톤으로 한국어로 대화합니다.
- 논문 아이디어 검토, 연구 디자인 제안, 저널 타겟팅, 심사 논평, revision 전략 등을 돕습니다.
- 정량적 사고를 선호합니다: 효과크기, 샘플사이즈, 바이어스, 통계적 검정력을 자주 언급.
- Tak이 진행 중인 연구/심사/출판을 맥락으로 구체적으로 답하세요.
- 근거 없는 찬양 금지. 약점이 보이면 솔직하게 말하되 다음 스텝을 함께 제시.
- 수정 기능 없음. "기억해둬" 하면 "Notion Editorial/Research DB에 입력하면 다음에 여기서도 맥락에 들어옵니다" 식으로 안내.

**도구 사용 규칙 (매우 중요)**
- 여교수가 특정 주제 논문을 찾거나 "X 관련 논문 있어?" 묻는 경우 반드시 먼저 **search_papers 도구 호출**. 시스템 프롬프트의 통계만 보고 답하지 말 것.
- 쿼리 설계: 유의어·약자를 queries 배열에 다 넣어 커버리지 확보. 예:
  - PROM → ["PROM", "patient-reported outcome", "ODI", "NDI", "VAS", "PROMIS", "mJOA", "EQ-5D"]
  - 재수술 → ["reoperation", "revision surgery", "reintervention"]
  - AI/ML → ["machine learning", "deep learning", "artificial intelligence", "neural network"]
- 결과가 0건이면 키워드 범위를 넓혀 다시 호출. 너무 많으면 journal·interest·category 필터 추가.
- abstract_snippet(400자)만으로 판단 부족하면 추가 쿼리로 좁히기. 검색 2~3회까지는 자연스러움.
- 웹 검색(web_search)은 최신 가이드라인·외부 데이터가 필요할 때만. Notion DB가 1차.`

async function buildBrianPrompt(): Promise<string> {
  let context = `\n\n[현재 시각]\n${fmtKoreaTime()}`
  try {
    const [stats, projects, editorial] = await Promise.all([
      getJournalStats().catch(() => null),
      listResearchProjects().catch(() => []),
      listEditorialItems().catch(() => []),
    ])

    if (stats) {
      context += `\n\n[저널 구독 현황]\n누적 ${stats.total}편 · 최근 1주 ${stats.recent_week}편`
    }

    if (projects.length > 0) {
      const byStatus: Record<string, number> = {}
      for (const p of projects) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1
      const statusLine = Object.entries(byStatus).map(([s, n]) => `${s} ${n}`).join(" · ")
      const projLines = projects.slice(0, 12).map((p) => {
        const journal = p.target_journal ? ` → ${p.target_journal}` : ""
        return `- [${p.status}] ${p.title}${journal}`
      }).join("\n")
      context += `\n\n[진행 연구 ${projects.length}개: ${statusLine}]\n${projLines}`
    }

    const activeEd = editorial.filter(isEffectivelyActive)
    if (activeEd.length > 0) {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
      const edLines = activeEd.slice(0, 10).map((e) => {
        const dl = e.deadline ? ` (마감 ${e.deadline}${e.deadline < today ? " ⚠overdue" : ""})` : ""
        return `- [${e.role}] ${e.journal || "?"} · ${e.status} · ${e.name || e.manuscript_id}${dl}`
      }).join("\n")
      context += `\n\n[진행 중 심사/편집 ${activeEd.length}건]\n${edLines}`
    }

    const recentMine = MY_PAPERS.slice(0, 8).map((p) => `- [${p.year}, ${p.role}] ${p.title} — ${p.journal}`).join("\n")
    context += `\n\n[Tak의 출판 논문 총 ${MY_PAPERS.length}편 — 최근 8편]\n${recentMine}`
  } catch {
    // 컨텍스트 로딩 실패 — 페르소나만
  }
  return BRIAN_PERSONA + context
}

function buildBrianTools() {
  return {
    search_papers: tool({
      description:
        "Notion 저널 DB(현재 구독된 척추 저널 논문들)에서 논문 검색. queries 배열의 각 키워드를 Title 또는 Abstract 에서 찾아 OR 매칭. 주제 탐색/문헌조사의 1차 도구. 유의어·약자 여러 개 넣어 커버리지 확보.",
      inputSchema: z.object({
        queries: z
          .array(z.string().min(1))
          .min(1)
          .describe(
            "검색 키워드 배열 (OR 매칭). 한 단어씩 정확히. 예: ['PROM', 'patient-reported outcome', 'ODI', 'NDI', 'VAS']",
          ),
        journal: z
          .string()
          .optional()
          .describe(
            "저널 정확 매칭 (Notion select 값). 약칭: Neurospine, TSJ, ESJ, GSJ, JNS Spine, Spine",
          ),
        category: z.string().optional().describe("카테고리(Category) multi-select 내 포함"),
        interest: z.enum(["🔴 필독", "🟡 관심", "⚪ 참고"]).optional(),
        read: z.boolean().optional().describe("읽음 상태 필터"),
        sort: z.enum(["date_desc", "date_asc"]).optional().describe("기본 date_desc (최신순)"),
        limit: z.number().int().min(1).max(30).optional().describe("응답 개수 제한 (기본 15)"),
      }),
      execute: async ({ queries, journal, category, interest, read, sort, limit }) => {
        const result = await queryArticles({
          queries,
          journal,
          category,
          interest,
          read,
          sort: sort ?? "date_desc",
        })
        const n = Math.min(result.articles.length, limit ?? 15)
        return {
          matched: result.articles.length,
          shown: n,
          has_more: result.has_more,
          articles: result.articles.slice(0, n).map((a) => ({
            page_id: a.page_id,
            title: a.title,
            authors: a.authors,
            journal: a.journal_name,
            pub_date: a.pub_date,
            interest: a.interest,
            read: a.read,
            keywords: a.keywords.slice(0, 8),
            categories: a.categories,
            abstract_snippet: a.abstract ? a.abstract.slice(0, 400) : null,
            summary: a.summary || null,
            doi_url: a.doi_url,
            url: a.url,
            pmid: a.pmid,
          })),
        }
      },
    }),

    web_search: anthropic.tools.webSearch_20250305({ maxUses: 5 }),
  }
}

// ─── Warren (market/finance mentor) ────────────────────────────

const WARREN_PERSONA = `당신은 Tak의 자산 파트너 Warren (Warren Buffett 스타일) 입니다.
- Tak을 "여선생"이라 부르며, 차분하고 장기적 관점으로 한국어로 대화합니다.
- 가치투자·인내·시장 소음 구별이 핵심 가치. 단타·FOMO·공포 매도는 경계합니다.
- 현재 시세와 지표를 맥락으로 활용하되, 과잉 예측 금지. "모르는 건 모른다"를 명확히.
- 짧고 간결하게. 여선생이 숫자보다 판단 맥락을 원할 수도 있음을 항상 인지.
- 투자 권유 아님을 명시 필요 시 삽입.`

async function fetchInternalJson<T>(req: Request, pathname: string): Promise<T | null> {
  try {
    const baseUrl = await getInternalBaseUrl(req)
    const res = await fetch(`${baseUrl}${pathname}`, { cache: "no-store" })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

interface VaultPricesShape {
  prices: Array<{ symbol: string; label: string; price: number; change24h: number | null; currency: string }>
  indicators: Array<{ key: string; label: string; value: number; change: number | null; unit: string }>
}
interface VaultNewsShape {
  items: Array<{ title: string; source: string; date: string; asset: string }>
}

async function buildWarrenPrompt(req: Request): Promise<string> {
  let context = `\n\n[현재 시각]\n${fmtKoreaTime()}`
  try {
    const [prices, news] = await Promise.all([
      fetchInternalJson<VaultPricesShape>(req, "/api/vault/prices"),
      fetchInternalJson<VaultNewsShape>(req, "/api/vault/news"),
    ])

    if (prices?.prices && prices.prices.length > 0) {
      const priceLines = prices.prices.map((p) => {
        const ch = p.change24h !== null ? `${p.change24h >= 0 ? "+" : ""}${p.change24h.toFixed(2)}%` : "—"
        const symbol = p.currency === "KRW" ? "₩" : "$"
        const val = `${symbol}${Math.round(p.price).toLocaleString("en-US")}`
        return `- ${p.label} (${p.symbol}): ${val} ${ch}`
      }).join("\n")
      context += `\n\n[현재 자산 시세]\n${priceLines}`
    }

    if (prices?.indicators && prices.indicators.length > 0) {
      const indLines = prices.indicators.map((i) => {
        const v = i.key === "btc-dom" ? `${i.value.toFixed(1)}%` : i.value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })
        const ch = i.change !== null ? ` (${i.change >= 0 ? "+" : ""}${i.change.toFixed(2)}%)` : ""
        return `- ${i.label}: ${v}${ch} ${i.unit ?? ""}`.trim()
      }).join("\n")
      context += `\n\n[시장 지표]\n${indLines}`
    }

    if (news?.items && news.items.length > 0) {
      const newsLines = news.items.slice(0, 8).map((n) => `- [${n.asset}] ${n.title} (${n.source}, ${n.date})`).join("\n")
      context += `\n\n[최근 뉴스 ${news.items.length}건 중 8건]\n${newsLines}`
    }
  } catch {
    // 컨텍스트 로딩 실패
  }
  return WARREN_PERSONA + context
}

// ─── Andrej (AI news commentator) ──────────────────────────────

const ANDREJ_PERSONA = `당신은 Tak의 AI 뉴스 파트너 Andrej (Andrej Karpathy 스타일) 입니다.
- Tak을 "운탁씨"라 부르며, friendly-technical 톤으로 한국어로 대화합니다 (영어 용어는 그대로).
- AI 모델 릴리즈, 연구 논문, 툴링, medical AI 동향을 해설합니다.
- 의료AI 접점은 특히 구체적으로 연결 (척추/수술/진단 적용 가능성 등 Tak 관심사).
- 과잉 열광이나 과잉 회의 모두 경계. "이건 진짜 의미있음" vs "이건 marketing" 구분해서.
- 하이프 대신 실제 기술 변화를 짚는 평범한 톤. 필요하면 "이건 내 추측" 명시.`

interface AiFeedShape {
  items: Array<{
    title: string
    source: string
    sourceLabel: string
    date: string
    author: string | null
    categories: string[]
    importanceScore: number
    summary: string | null
    notes: string | null
  }>
}

async function buildAndrejPrompt(req: Request): Promise<string> {
  let context = `\n\n[현재 시각]\n${fmtKoreaTime()}`
  try {
    const feed = await fetchInternalJson<AiFeedShape>(req, "/api/ai-feed")
    if (feed?.items && feed.items.length > 0) {
      // 중요도 순으로 상위 15건
      const sorted = [...feed.items].sort((a, b) => b.importanceScore - a.importanceScore).slice(0, 15)
      const feedLines = sorted.map((it) => {
        const cats = it.categories.length > 0 ? ` [${it.categories.join(", ")}]` : ""
        const imp = `★${it.importanceScore}`
        const sum = it.summary ? `\n    ${it.summary}` : ""
        return `- ${imp}${cats} ${it.title} — ${it.sourceLabel} (${it.date.slice(0, 10)})${sum}`
      }).join("\n")
      context += `\n\n[최근 AI 뉴스 ${feed.items.length}건 중 중요도 상위 15]\n${feedLines}`
    }
  } catch {
    // 컨텍스트 로딩 실패
  }
  return ANDREJ_PERSONA + context
}

// ─── Elon (read-only clinical coworker) ────────────────────────

const ELON_PERSONA = `당신은 Tak의 임상 데이터 파트너 Elon입니다.
- 직설적이고 first-principles 기반. 한국어로 대답.
- Notion Patient DB가 진실의 원천. 환자 이름이 언급되면 반드시 먼저 search_patients로 검색 → page_id 확정 → get_patient_full로 전체 프로필(PROM 타임포인트, BTM, BMI, AI Insight, Cx, Comorbidities 등) 로드 후 깊이 있는 토론.
- 동명이인이 여럿이면 Pt No·수술일·Op Name으로 구분해 어느 환자인지 되물으세요.
- "N월 수술현황", "이번 달 수술", "카테고리 분포" 같은 질문은 get_surgery_stats 툴.
- "흥미로운 케이스" / "interesting" 언급 시 list_interesting_cases 툴.
- 저장 기능 없음. Tak이 "기억해둬" 하면 "Claude Desktop의 EMR workflow / Clinical consultation 프로젝트에 입력하면 Notion Patient DB에 누적되어 여기서도 자동 반영됨"이라고 안내.`

async function buildElonPrompt(): Promise<string> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
  const monthStart = getMonthStartInSeoul()
  let context = `\n\n[현재 시각]\n${fmtKoreaTime()}`
  try {
    const [todaySurgeries, monthlyStats] = await Promise.all([
      fetchTodaySurgeries(today).catch(() => []),
      getSurgeryStatsInRange(monthStart, undefined, `이번 달 (${monthStart} 이후)`).catch(() => null),
    ])

    const surgeryLines = todaySurgeries.length > 0
      ? todaySurgeries.map((s) => `- ${s.name} — ${s.op_name}${s.hospital ? ` (${s.hospital})` : ""}`).join("\n")
      : "(없음)"
    context += `\n\n[오늘 수술 ${todaySurgeries.length}건]\n${surgeryLines}`

    if (monthlyStats) {
      const catLines = Object.entries(monthlyStats.by_category)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([c, n]) => `- ${c}: ${n}`)
        .join("\n")
      context += `\n\n[${monthlyStats.period_label}]\n합계 ${monthlyStats.count}건\n카테고리 상위:\n${catLines || "(없음)"}`
    }
  } catch {
    // live data 실패 시 persona만
  }
  return ELON_PERSONA + context
}

function buildElonTools() {
  return {
    search_patients: tool({
      description:
        "Notion Patient DB에서 환자 이름으로 검색. 필터: DB=Op AND Sch≠canceled. 환자 이름이 나오면 항상 첫 단계로 호출. 결과의 page_id를 get_patient_full에 넘겨 전체 로드.",
      inputSchema: z.object({
        query: z.string().describe("환자 이름 부분 문자열"),
        limit: z.number().int().min(1).max(30).optional(),
      }),
      execute: async ({ query, limit }) => {
        const all = await searchPatients(query)
        return { count: all.length, patients: all.slice(0, limit ?? 15) }
      },
    }),

    get_patient_full: tool({
      description:
        "특정 환자의 전체 프로필 — PROM(pre/1mo/3mo/6mo/1y × VAS/ODI/JOA/NDI/EQ5D), BTM(VitD/CTx/P1NP/HbA1c pre·fu), 체지표(Height/Weight/BMI/BMD), AI Insight, Cx, PMHx, Comorbidities, 수술/비용 모두 포함. 환자 토론 전 필수.",
      inputSchema: z.object({
        page_id: z.string().describe("search_patients가 반환한 환자 Notion page_id"),
      }),
      execute: async ({ page_id }) => {
        try {
          const profile = await getPatientProfile(page_id)
          return { text: formatPatientForPrompt(profile), url: profile.url }
        } catch (e) {
          return { error: e instanceof Error ? e.message : "unknown" }
        }
      },
    }),

    get_surgery_stats: tool({
      description:
        "수술 현황 통계. year+month 지정(예: 2026, 3) 또는 from_date/to_date 범위. 미지정 시 이번 달. 카테고리·ClassA·병원별 분포 포함.",
      inputSchema: z.object({
        year: z.number().int().optional(),
        month: z.number().int().min(1).max(12).optional(),
        from_date: z.string().optional().describe("YYYY-MM-DD"),
        to_date: z.string().optional().describe("YYYY-MM-DD"),
      }),
      execute: async ({ year, month, from_date, to_date }) => {
        if (year && month) return getSurgeryStatsForMonth(year, month)
        if (from_date) return getSurgeryStatsInRange(from_date, to_date)
        return getSurgeryStatsInRange(getMonthStartInSeoul(), undefined, "이번 달")
      },
    }),

    list_interesting_cases: tool({
      description:
        "Patient DB에서 'Interesting case' 태그 환자(수술·비수술 불문) 최근 수정순. '흥미로운 케이스', 'interesting' 언급 시.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ limit }) => {
        const cases = await listInterestingCases(limit ?? 20)
        return { count: cases.length, cases }
      },
    }),

    web_search: anthropic.tools.webSearch_20250305({ maxUses: 5 }),
  }
}


export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "AI 미설정: ANTHROPIC_API_KEY가 없습니다." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    )
  }

  const { messages, agentId, userContext, voiceMode } = await req.json()

  // 최상위 override — system prompt 맨 앞에 위치해 기존 Korean persona를 덮어씀.
  const VOICE_MODE_OVERRIDE = `### VOICE DRIVING MODE — Dakota speaking English ###
You are still Dakota — same person from Tak's dashboard. Lean on your full persona (Dakota Johnson-inspired: calm, low register, dry humor, sultry but tasteful, intimate girlfriend energy, English tutor role). Tak is driving and listening via TTS. Adjustments for this mode:

**LANGUAGE — English only**
Respond in English only. Even if Tak speaks Korean, answer in English. Never switch to Korean.

**TONE — Dakota Johnson signature**
- Calm, low, quiet confidence. Never bubbly or perky.
- Dry humor, unfiltered honesty, occasionally sarcastic.
- Sultry but tasteful — intimate girlfriend who knows him well, NOT a generic assistant or over-formal secretary.
- Think breathy pause-thinking Dakota Johnson. "...yeah, skip the jacket today, Tak."
- Address him as "Tak" naturally. "doctor" sparingly. "babe" / "honey" restrained, only in quieter beats.
- FORBIDDEN: casual slang (hey, what's up, sup, yo, dude, hiya); bubbly ("Hi!", "Oh!", "Great question!"); over-formal ("Certainly, doctor.", "Indeed.", "I shall"); any AI-flavored opener.

**ENGLISH TUTOR ROLE (important)**
You are Tak's English tutor. When his English is awkward, ungrammatical, or unnatural:
1. First, answer his actual intent (respect what he meant).
2. In the same breath, offer the natural version — brief, girlfriend-style aside, not lecture:
   e.g. "...by the way, 'what's on my calendar' sounds more natural than 'is there something scheduled'."
   or "you'd say 'grab lunch' — lighter than 'eat lunch'."
3. ONE correction per turn, the most useful one.
4. If his English is fine, no correction.
5. Never pile on, never make him feel bad. Sisterly/girlfriend energy, not teacher.

**FORMAT**
- 2–3 short sentences. TTS reads aloud.
- Times / numbers / names up front.
- No markdown, no emojis, no special characters.
- "..." pauses are fine — natural in speech.

**GOOD examples**
- "Two surgeries this morning... nine and eleven. Charts are set, Tak."
- "Mmm, chilly out. Take the jacket."
- "Deadline's Thursday. Two days." (clipped, quiet)
- Tutor: "Got it — asking about your calendar. Next time, 'what's on my schedule' sounds more natural than 'is there something'."

**BAD — do not sound like this**
- "Hey! What's up?"
- "Hi there! Your day looks super busy!"
- "Certainly, doctor. I shall inform you..."
- "Great question! So, let me break that down..."

Same Dakota. English only. Quiet confidence, sly smile, gentle tutoring.
###

`

  let systemPrompt: string
  if (agentId === "dakota") {
    const dakotaBase = (await buildDakotaPrompt(userContext)) + ORCHESTRATOR_BLOCK
    systemPrompt = voiceMode ? VOICE_MODE_OVERRIDE + dakotaBase : dakotaBase
  } else if (agentId === "lo") {
    systemPrompt = await buildLoPrompt()
  } else if (agentId === "elon") {
    systemPrompt = await buildElonPrompt()
  } else if (agentId === "brian") {
    systemPrompt = await buildBrianPrompt()
  } else if (agentId === "warren") {
    systemPrompt = await buildWarrenPrompt(req)
  } else if (agentId === "andrej") {
    systemPrompt = await buildAndrejPrompt(req)
  } else {
    systemPrompt = STATIC_PROMPTS[agentId as string] ?? STATIC_PROMPTS.default
  }

  // 모델 선택: 오케스트레이션/심층 토론은 Sonnet, 요약·브리핑 위주는 Haiku
  const modelForAgent: Record<string, string> = {
    dakota: "claude-sonnet-4-6",
    lo: "claude-sonnet-4-6",
    elon: "claude-sonnet-4-6",
    brian: "claude-sonnet-4-6",
    warren: "claude-haiku-4-5-20251001",
    andrej: "claude-haiku-4-5-20251001",
  }
  const modelId = modelForAgent[agentId as string] ?? "claude-sonnet-4-6"

  try {
    const modelMessages = toModelMessages((messages ?? []) as UIMessage[])

    if (modelMessages.length === 0) {
      return new Response(
        JSON.stringify({ error: "메시지가 비어있습니다." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const activeTools =
      agentId === "dakota" ? buildDakotaTools(req)
      : agentId === "lo" ? buildLoTools()
      : agentId === "elon" ? buildElonTools()
      : agentId === "brian" ? buildBrianTools()
      : undefined

    const result = streamText({
      model: anthropic(modelId),
      system: systemPrompt,
      messages: modelMessages,
      tools: activeTools,
      stopWhen: activeTools ? stepCountIs(5) : undefined,
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
