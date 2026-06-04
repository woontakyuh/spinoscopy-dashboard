import { NextResponse, type NextRequest } from "next/server"

export const dynamic = "force-dynamic"

// 매일 아침 Dakota 가 5 agent 의 인사말을 한 묶음으로 정리해 텔레그램으로 전송.
// Vercel Cron + Bearer CRON_SECRET, 또는 수동 POST 호출 (Bearer DAKOTA_DIGEST_TOKEN).

const AGENT_LABELS: Record<string, string> = {
  elon: "🩺 Elon",
  brian: "🔬 Brian",
  warren: "💰 Warren",
  lo: "🥋 Lo",
  andrej: "🛰️ Andrej",
}

const AGENT_ORDER = ["elon", "brian", "warren", "lo", "andrej"] as const

function isAuthorized(req: NextRequest): boolean {
  // Vercel Cron: Bearer CRON_SECRET / 수동: Bearer DAKOTA_DIGEST_TOKEN
  const auth = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  const digestToken = process.env.DAKOTA_DIGEST_TOKEN
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true
  if (digestToken && auth === `Bearer ${digestToken}`) return true
  return false
}

async function fetchGreetings(req: NextRequest): Promise<Record<string, string>> {
  const url = new URL(req.url)
  const origin = `${url.protocol}//${url.host}`
  const res = await fetch(`${origin}/api/dashboard/greetings`, { cache: "no-store" })
  if (!res.ok) throw new Error(`greetings ${res.status}`)
  return res.json()
}

function composeDigest(greetings: Record<string, string>): string {
  const today = new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" })
  const lines: string[] = []
  lines.push(`*센터장님, ${today} 오늘의 한 줄 브리핑이에요.*`)
  lines.push("")
  for (const id of AGENT_ORDER) {
    const text = greetings[id]
    if (!text) continue
    lines.push(`${AGENT_LABELS[id]}\n${text}`)
    lines.push("")
  }
  lines.push("— Dakota")
  return lines.join("\n")
}

async function sendTelegram(text: string): Promise<{ sent: boolean; reason?: string }> {
  const token = process.env.DAKOTA_TELEGRAM_BOT_TOKEN
  const chatId = process.env.DAKOTA_TELEGRAM_DIGEST_CHAT_ID
  if (!token) return { sent: false, reason: "DAKOTA_TELEGRAM_BOT_TOKEN missing" }
  if (!chatId) return { sent: false, reason: "DAKOTA_TELEGRAM_DIGEST_CHAT_ID missing" }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    return { sent: false, reason: `telegram ${res.status}: ${body.slice(0, 200)}` }
  }
  return { sent: true }
}

async function run(req: NextRequest, sendMode: boolean) {
  const greetings = await fetchGreetings(req)
  const message = composeDigest(greetings)
  if (!sendMode) {
    // 텍스트만 — Hermes 같은 외부 에이전트가 fetch 후 자체 delivery
    return { ok: true, sent: false, text: message }
  }
  const result = await sendTelegram(message)
  return { ok: result.sent, ...result, preview: message.slice(0, 200) }
}

// Vercel Cron / Hermes / 수동 모두 GET 으로 호출.
// 기본은 Vercel 측에서 Telegram 전송. ?send=false 로 호출하면 composed text 만 리턴
// → Hermes 가 fetch 해서 본인 delivery 라인으로 전달하는 패턴.
// 텍스트만 받는 GET 은 인증 없이 허용 (민감 데이터 없음, 캐시 가능).
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const sendParam = url.searchParams.get("send")
  const sendMode = sendParam !== "false" && sendParam !== "0"
  if (sendMode && !isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const result = await run(req, sendMode)
    return NextResponse.json(result, {
      headers: sendMode ? {} : { "Cache-Control": "private, max-age=300" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// 수동 트리거 (테스트용) — 항상 Telegram 전송
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const result = await run(req, true)
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
