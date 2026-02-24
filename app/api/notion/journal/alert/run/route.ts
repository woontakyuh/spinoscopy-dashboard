import { NextRequest, NextResponse } from "next/server"
import { runJournalAlertPipeline } from "@/lib/journal-alert/pipeline"

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

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
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
