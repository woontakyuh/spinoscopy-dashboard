import { anthropic } from "@ai-sdk/anthropic"
import { streamText } from "ai"
import { getAllTodos } from "@/lib/notion/todo"
import { getUpcomingSchedules } from "@/lib/notion/schedule"

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
  try {
    const [todos, schedules] = await Promise.all([
      getAllTodos({ status: "active" }).catch(() => []),
      getUpcomingSchedules(14).catch(() => []),
    ])

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

  return persona + context
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
  let modelId: string
  if (agentId === "dakota") {
    systemPrompt = await buildDakotaPrompt()
    modelId = "claude-opus-4-6"
  } else {
    systemPrompt = STATIC_PROMPTS[agentId as string] ?? STATIC_PROMPTS.default
    modelId = "claude-sonnet-4-5"
  }

  const result = streamText({
    model: anthropic(modelId),
    system: systemPrompt,
    messages,
  })

  return result.toTextStreamResponse()
}
