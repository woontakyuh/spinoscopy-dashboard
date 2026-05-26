import { NextResponse } from "next/server"
import { getJournalStats } from "@/lib/notion/journal"
import { getAllPatientRows } from "@/lib/notion/analytics"
import { listResearchProjects } from "@/lib/notion/research"
import { listEditorialItems } from "@/lib/notion/editorial"
import { isPendingMyAction } from "@/lib/editorial/status"

export const dynamic = "force-dynamic"

function timeBucket(): "night" | "dawn" | "morning" | "day" | "evening" {
  const h = new Date().getUTCHours()
  // Seoul = UTC+9
  const seoulH = (h + 9) % 24
  if (seoulH < 5) return "night"
  if (seoulH < 8) return "dawn"
  if (seoulH < 12) return "morning"
  if (seoulH < 18) return "day"
  return "evening"
}

async function brianGreeting(): Promise<string> {
  try {
    const [stats, research, editorial] = await Promise.all([
      getJournalStats().catch(() => null),
      listResearchProjects().catch(() => []),
      listEditorialItems().catch(() => []),
    ])
    const pendingEditorial = editorial.filter(isPendingMyAction).length
    if (pendingEditorial > 0) {
      return `여교수, 처리할 심사 ${pendingEditorial}편 있네. 우선순위 정리해보세.`
    }
    const revision = research.filter((r) => r.status === "Revision").length
    if (revision > 0) {
      return `여교수, Revision 받은 논문 ${revision}편. 코멘트 정리부터 같이 볼까.`
    }
    if (stats) {
      if (stats.recent_week >= 10) return `여교수, 이번 주 ${stats.recent_week}편 올라왔네. 풍년이야 — spine 쪽 핵심부터 같이 보세.`
      if (stats.recent_week >= 1) return `여교수, 이번 주 새 논문 ${stats.recent_week}편 들어왔네. 한번 훑어보게.`
      return `여교수, 이번 주엔 새로 들어온 게 없군. 그동안 모아둔 ${stats.total}편 중에 다시 들여다볼 만한 거 찾아볼까.`
    }
    return "여교수, 최신 저널들 좀 정리해두고 있네."
  } catch {
    return "여교수, 오늘은 어떤 논문 같이 볼까?"
  }
}

async function elonGreeting(): Promise<string> {
  try {
    const data = await getAllPatientRows()
    const patients = data.patients
    const tc = timeBucket()
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const recent = patients.filter((p) => p.op_date && p.op_date >= weekAgo).length
    if (tc === "night" || tc === "dawn") return "Tak, 이 시간에도 일이야? 좀 쉬어."
    if (recent === 0) return `Tak, 누적 ${patients.length}명. 이번 주는 신규 없었어. 기존 PROM 추이 한번 훑어보자.`
    if (recent >= 5) return `Tak, 이번 주 ${recent}건 새로 들어왔어. 바빴겠다. PROM 빠뜨리지 마.`
    return `Tak, 이번 주 새로 ${recent}건 들어왔어. 가장 최근 건부터 — PROM 챙기자.`
  } catch {
    return "Tak, 환자 데이터 같이 보자."
  }
}

function warrenGreeting(): string {
  const tc = timeBucket()
  if (tc === "morning") return "여선생, 아침 장 한번 보시죠."
  if (tc === "evening") return "여선생, 오늘 시장 어땠는지 정리해드릴까요."
  return "여선생, 차분히 시세 같이 보시죠."
}

function loGreeting(): string {
  const tc = timeBucket()
  if (tc === "morning") return "Tak, 오늘 매트 갈 시간 있어?"
  if (tc === "evening") return "Tak, 오늘 훈련 기록 정리하자."
  return "Tak, 컨디션 어때?"
}

function andrejGreeting(): string {
  return "Tak, AI 새 소식 정리해 놨어. 한 번 훑어봐."
}

export async function GET() {
  const [brian, elon] = await Promise.all([
    brianGreeting(),
    elonGreeting(),
  ])
  const greetings = {
    elon,
    brian,
    warren: warrenGreeting(),
    lo: loGreeting(),
    andrej: andrejGreeting(),
  }
  return NextResponse.json(greetings, {
    headers: { "Cache-Control": "private, max-age=600, stale-while-revalidate=300" },
  })
}
