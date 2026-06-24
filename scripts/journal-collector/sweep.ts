// scripts/journal-collector/sweep.ts
// going-forward 일일 메일 — 코어 6개 저널 PubMed 스윕 + 신규 인서트 + 이메일 + Alerted 마킹.
// 병원 M4 맥미니 launchd 에서 매일 실행 (Vercel cron 대체, 병원 IP 라 429 없음).
// env: JOURNAL_SWEEP_DAYS(기본 3), JOURNAL_SWEEP_EMAIL("false"면 메일 끔 — 테스트용)
import { runJournalAlertPipeline } from "../../lib/journal-alert/pipeline"

async function main() {
  const days = Number(process.env.JOURNAL_SWEEP_DAYS ?? "3")
  const sendEmail = process.env.JOURNAL_SWEEP_EMAIL !== "false"
  console.log(`[sweep ${new Date().toISOString()}] start (days=${days}, email=${sendEmail})`)
  const res = await runJournalAlertPipeline(Number.isFinite(days) && days > 0 ? days : 3, { sendEmail })
  console.log(`[sweep ${new Date().toISOString()}] done`, JSON.stringify(res))
}
main().catch((e) => { console.error("[sweep] 실패:", e); process.exit(1) })
