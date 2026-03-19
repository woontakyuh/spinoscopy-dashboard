import { NextRequest, NextResponse } from "next/server"
import { runJournalAlertPipeline, migrateMarkAllAlerted } from "@/lib/journal-alert/pipeline"

function parseDays(value: string | null): number {
  const parsed = Number(value ?? "7")
  if (!Number.isFinite(parsed) || parsed <= 0) return 7
  return Math.min(Math.floor(parsed), 60)
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.JOURNAL_ALERT_RUN_TOKEN
  if (!expected) return false
  const auth = req.headers.get("authorization")
  if (!auth) return false
  return auth === `Bearer ${expected}`
}

// Vercel Cron에서 GET으로 호출
export async function GET(req: NextRequest) {
  try {
    // Vercel Cron은 CRON_SECRET 헤더로 인증
    const cronSecret = process.env.CRON_SECRET
    const authHeader = req.headers.get("authorization")
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const days = parseDays(searchParams.get("days"))
    const result = await runJournalAlertPipeline(days)
    return NextResponse.json({ ok: true, days, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)

    // 일회성 마이그레이션: 기존 논문 전체를 Alerted=true로 설정
    if (searchParams.get("migrate") === "1") {
      const databaseId = process.env.NOTION_JOURNAL_DB_ID
      if (!databaseId) return NextResponse.json({ error: "NOTION_JOURNAL_DB_ID missing" }, { status: 500 })
      const marked = await migrateMarkAllAlerted(databaseId)
      return NextResponse.json({ ok: true, migrated: marked })
    }

    const days = parseDays(searchParams.get("days"))
    const result = await runJournalAlertPipeline(days)
    return NextResponse.json({ ok: true, days, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
