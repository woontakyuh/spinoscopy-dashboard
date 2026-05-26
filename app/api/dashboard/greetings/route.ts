import { NextResponse, type NextRequest } from "next/server"
import { getJournalStats } from "@/lib/notion/journal"
import { getAllPatientRows } from "@/lib/notion/analytics"
import { listResearchProjects } from "@/lib/notion/research"
import { listEditorialItems } from "@/lib/notion/editorial"
import { isPendingMyAction } from "@/lib/editorial/status"

export const dynamic = "force-dynamic"

function originOf(req: NextRequest): string {
  const url = new URL(req.url)
  return `${url.protocol}//${url.host}`
}

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

interface PriceRow { symbol: string; price: number; change24h: number | null }
interface NewsRow { title: string; asset?: string }
async function warrenGreeting(origin: string): Promise<string> {
  try {
    const [pricesRes, newsRes] = await Promise.all([
      fetch(`${origin}/api/vault/prices`, { cache: "no-store" }),
      fetch(`${origin}/api/vault/news`, { cache: "no-store" }),
    ])
    const prices = pricesRes.ok ? (await pricesRes.json()) as PriceRow[] : []
    const news = newsRes.ok ? (await newsRes.json()) as NewsRow[] : []
    const btc = prices.find((p) => p.symbol === "BTC")
    const btcNews = news.find((n) => n.asset === "BTC")
    if (!btc) return "여선생, 비트코인 시세 못 가져왔어요. 잠시 후 다시."
    const ch = btc.change24h ?? 0
    const pct = `${ch >= 0 ? "+" : ""}${ch.toFixed(2)}%`
    const priceStr = btc.price >= 1000
      ? `$${Math.round(btc.price).toLocaleString("en-US")}`
      : `$${btc.price.toFixed(2)}`
    const newsSnippet = btcNews ? ` "${btcNews.title.slice(0, 60)}"` : ""
    if (ch <= -3) return `여선생, 비트코인 ${pct} (${priceStr}). 공포장이에요.${newsSnippet}`
    if (ch >= 3)  return `여선생, 비트코인 ${pct} (${priceStr}). 강한 랠리네요.${newsSnippet}`
    return `여선생, 비트코인 ${pct} (${priceStr}). 횡보 중.${newsSnippet}`
  } catch {
    return "여선생, 시장 데이터 잠시 가져오는 중이에요."
  }
}

function loGreeting(): string {
  const tc = timeBucket()
  if (tc === "morning") return "Tak, 오늘 매트 갈 시간 있어?"
  if (tc === "evening") return "Tak, 오늘 훈련 기록 정리하자."
  return "Tak, 컨디션 어때?"
}

interface FeedItem { title: string; source: string; sourceLabel?: string; tier?: string; importanceScore?: number }
async function andrejGreeting(origin: string): Promise<string> {
  try {
    const res = await fetch(`${origin}/api/ai-feed`, { cache: "no-store" })
    if (!res.ok) throw new Error("ai-feed")
    const data = await res.json() as { items?: FeedItem[] }
    const items = data.items ?? []
    // 최근 ai-company tier 의 중요도 높은 항목 우선
    const top = [...items]
      .filter((i) => i.tier === "ai-company" || (i.importanceScore ?? 0) >= 4)
      .sort((a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0))[0]
      ?? items[0]
    if (!top) return "Tak, 오늘은 아직 새 AI 소식이 없어. 좀 있다 다시 보자."
    return `Tak, 오늘 핵심 — "${top.title.slice(0, 80)}" (${top.sourceLabel ?? top.source}).`
  } catch {
    return "Tak, AI 새 소식 정리해 놨어. 한 번 훑어봐."
  }
}

export async function GET(req: NextRequest) {
  const origin = originOf(req)
  const [brian, elon, warren, andrej] = await Promise.all([
    brianGreeting(),
    elonGreeting(),
    warrenGreeting(origin),
    andrejGreeting(origin),
  ])
  const greetings = {
    elon,
    brian,
    warren,
    lo: loGreeting(),
    andrej,
  }
  return NextResponse.json(greetings, {
    headers: { "Cache-Control": "private, max-age=600, stale-while-revalidate=300" },
  })
}
