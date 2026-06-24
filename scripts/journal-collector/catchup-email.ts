// scripts/journal-collector/catchup-email.ts
// 일회성 캐치업 메일 — 2026-05-31~ 시스템 오류로 1달간 발송 못 한 누락 논문을
// 사과문과 함께 한 번에 정리해 보낸다. 발송 시점 Notion 을 조회하므로,
// 그 전까지 보충된 논문(TSJ/JNSS/Spine 누락분 포함)이 자동 포함된다.
// 멱등: 발송 후 sentinel 파일을 남겨 재실행 시 no-op. DRY_RUN=1 이면 발송 대신 출력.
import nodemailer from "nodemailer"
import { existsSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const RECOVERY_FROM = "2026-06-24T00:00:00.000Z" // 복구 batch 가 생성된 시점(UTC)
const SENTINEL = join(homedir(), ".journal-catchup-sent")
const DRY = process.env.DRY_RUN === "1"

const NOTION_TOKEN = process.env.NOTION_TOKEN
const DB = process.env.NOTION_JOURNAL_DB_ID?.trim()
const NH = { Authorization: `Bearer ${NOTION_TOKEN}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" }

interface Row { title: string; authors: string; journal: string; link: string; pubDate: string; interest: string }

async function loadRecovery(): Promise<Row[]> {
  const rows: Row[] = []
  let cursor: string | undefined
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${DB}/query`, {
      method: "POST", headers: NH,
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    })
    const j: any = await res.json()
    if (j.object === "error") throw new Error(`Notion: ${j.message}`)
    for (const p of j.results) {
      if ((p.created_time || "") < RECOVERY_FROM) continue
      const pr = p.properties
      const txt = (x: any) => (x?.title || x?.rich_text || []).map((v: any) => v.plain_text).join("")
      rows.push({
        title: txt(pr.Title),
        authors: txt(pr.Author),
        journal: pr["Journal Name"]?.select?.name || "",
        link: pr.DOI?.url || p.url || "",
        pubDate: pr["Publication Date"]?.date?.start || "",
        interest: pr["관심도"]?.select?.name || "",
      })
    }
    cursor = j.has_more ? j.next_cursor : undefined
  } while (cursor)
  return rows
}

function esc(s: string) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") }

function buildHtml(must: Row[], refCount: number): string {
  const items = must.map((r) => `
    <li style="margin:0 0 14px 0;line-height:1.5">
      <a href="${esc(r.link)}" style="color:#2563eb;text-decoration:none;font-weight:600">${esc(r.title)}</a><br>
      <span style="color:#6b7280;font-size:13px">${esc(r.authors)} · <b>${esc(r.journal)}</b>${r.pubDate ? " · " + esc(r.pubDate) : ""}</span>
    </li>`).join("")
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:680px;margin:0 auto;color:#111">
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px 18px;margin-bottom:20px">
      <p style="margin:0 0 8px 0;font-weight:700;color:#b91c1c">⚠️ 알림 발송 오류 안내 · 약 1개월치 누락분 일괄 정리</p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#7f1d1d">
        시스템 오류로 <b>2026년 5월 말부터 약 1개월간</b> 신규 논문 알림 메일이 발송되지 못했습니다.
        원인(수집 서버 IP 차단 등)을 해결하고 그동안 누락된 논문을 모두 복구했습니다.
        아래는 그 기간에 새로 수집된 <b>필독(🔴) 논문 ${must.length}건</b>입니다. 불편을 드려 죄송합니다.
      </p>
    </div>
    <h2 style="font-size:16px;margin:0 0 12px 0">🔴 필독 ${must.length}건</h2>
    <ul style="padding-left:18px;margin:0">${items}</ul>
    <p style="margin:22px 0 0 0;padding-top:14px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280">
      이 외 <b>참고급 논문 ${refCount}건</b>도 같은 기간 수집되어 대시보드에서 확인하실 수 있습니다.
      내일부터는 매일 정상적으로 신규 논문 알림이 발송됩니다.
    </p>
  </div>`
}

async function main() {
  if (existsSync(SENTINEL)) { console.log("[catchup] 이미 발송됨(sentinel 존재) — no-op"); return }
  if (!DB || !NOTION_TOKEN) throw new Error("NOTION_TOKEN/NOTION_JOURNAL_DB_ID 없음")
  const rows = await loadRecovery()
  const must = rows.filter((r) => r.interest.includes("필독")).sort((a, b) => (b.pubDate || "").localeCompare(a.pubDate || ""))
  const refCount = rows.filter((r) => r.interest.includes("참고")).length
  console.log(`[catchup] recovery=${rows.length}, 필독=${must.length}, 참고=${refCount}`)
  if (must.length === 0) { console.log("[catchup] 필독 0건 — 발송 안 함"); return }

  const clean = (s?: string) => (s || "").replace(/\\n/g, "").replace(/["\r\n]/g, "").trim()
  const user = process.env.JOURNAL_ALERT_SMTP_USER
  const to = clean(process.env.JOURNAL_ALERT_RECIPIENT ?? user) || undefined
  const cc = clean(process.env.JOURNAL_ALERT_CC) || undefined
  const subject = `[Scholar] 📚 누락 논문 일괄 정리 — 필독 ${must.length}건 (1개월 알림 오류 복구)`
  const html = buildHtml(must, refCount)

  if (DRY) {
    console.log("=== DRY RUN (발송 안 함) ===")
    console.log("To:", to, "| Cc:", cc || "(none)")
    console.log("Subject:", subject)
    console.log("필독 목록 상위 5:")
    must.slice(0, 5).forEach((r, i) => console.log(`  ${i + 1}. [${r.journal}] ${r.title.slice(0, 70)}`))
    console.log(`HTML ${html.length} chars`)
    return
  }

  const transport = nodemailer.createTransport({
    host: process.env.JOURNAL_ALERT_SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.JOURNAL_ALERT_SMTP_PORT ?? "587"),
    secure: false,
    auth: { user, pass: process.env.JOURNAL_ALERT_SMTP_PASS },
  })
  const info = await transport.sendMail({ from: user, to, cc, subject, html })
  writeFileSync(SENTINEL, new Date().toISOString())
  console.log("[catchup] 발송 완료:", info.messageId)
}

main().catch((e) => { console.error("[catchup] 실패:", e); process.exit(1) })
