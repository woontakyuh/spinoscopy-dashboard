// 맥 mini 전용 소셜 수집기.
// Threads(@choi.openai) = Playwright 렌더.
// 수집 → Notion "Social Feed" DB에 신규만 적재. 실패는 기존 데이터에 영향 없음.
// (X는 로그아웃 syndication이 IP 레이트리밋으로 상시 막혀 제외 — 2026-06-22)
//
// 필요 env: NOTION_TOKEN, NOTION_SOCIAL_DB_ID
// 실행: node collect.mjs   (launchd 1h)

import { chromium } from "playwright"
import {
  dedupeByPostId,
  normalizeDate,
  toNotionProperties,
  cleanThreadText,
  sinceDate,
  withinSince,
} from "./normalize.mjs"

// 최근 N일치를 수집 (주간 백필)
const SINCE_DAYS = 7
const MAX_SCROLLS = 40

const NOTION_TOKEN = process.env.NOTION_TOKEN
const NOTION_DB = process.env.NOTION_SOCIAL_DB_ID
const NOTION_BASE = "https://api.notion.com/v1"
const NOTION_HEADERS = {
  Authorization: `Bearer ${NOTION_TOKEN}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json",
}

const ACCOUNTS = {
  threads: ["choi.openai"],
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"

function log(...args) {
  console.log(`[social-collector ${new Date().toISOString()}]`, ...args)
}

// ─── Threads (Playwright) ───
// 최근 SINCE_DAYS일치까지 스크롤하며 누적 수집 (Threads는 가상화로 옛 글이 언마운트되므로
// 매 스크롤마다 추출해 postId로 머지). 가장 오래된 글이 컷오프를 넘으면 중단.
async function collectThreads(account) {
  const cutoff = sinceDate(SINCE_DAYS, Date.now())
  const extract = (acct) => {
    const out = []
    document.querySelectorAll("[data-pressable-container]").forEach((el) => {
      const text = (el.innerText || "").trim()
      if (!text || text.length < 10) return
      const a = el.querySelector(`a[href*="/post/"]`)
      const href = a ? a.getAttribute("href") : null
      const m = href ? href.match(/\/post\/([A-Za-z0-9_-]+)/) : null
      if (!m) return
      const timeEl = el.querySelector("time[datetime]")
      out.push({
        postId: m[1],
        text,
        url: href.startsWith("http") ? href : `https://www.threads.com${href}`,
        postedAtRaw: timeEl ? timeEl.getAttribute("datetime") : "",
      })
    })
    return out
  }

  let browser
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true })
    const ctx = await browser.newContext({ userAgent: UA, locale: "ko-KR" })
    const page = await ctx.newPage()
    await page.goto(`https://www.threads.com/@${account}`, { waitUntil: "domcontentloaded", timeout: 45000 })
    await page.waitForTimeout(6000)

    const seen = new Map()
    for (let s = 0; s < MAX_SCROLLS; s++) {
      const batch = await page.evaluate(extract, account)
      for (const r of batch) if (!seen.has(r.postId)) seen.set(r.postId, r)
      // 가장 오래된 (날짜 있는) 글이 컷오프보다 과거면 일주일치 다 받은 것
      const dates = [...seen.values()].map((r) => normalizeDate(r.postedAtRaw)).filter(Boolean).sort()
      if (dates.length && dates[0] < cutoff) break
      const before = seen.size
      await page.mouse.wheel(0, 5000)
      await page.waitForTimeout(1800)
      // 새 글이 두 번 연속 안 늘면 (로그아웃 스크롤 한계) 중단
      const grew = await page.evaluate(extract, account).then((b) => {
        for (const r of b) if (!seen.has(r.postId)) seen.set(r.postId, r)
        return seen.size > before
      })
      if (!grew && s > 3) break
    }

    return [...seen.values()]
      .map((r) => ({
        platform: "threads",
        account,
        postId: r.postId,
        text: cleanThreadText(r.text, account),
        url: r.url,
        postedAt: normalizeDate(r.postedAtRaw),
      }))
      .filter((it) => withinSince(it, cutoff))
  } finally {
    if (browser) await browser.close()
  }
}

// ─── Notion ───
async function fetchExistingPostIds(limit = 100) {
  const res = await fetch(`${NOTION_BASE}/databases/${NOTION_DB}/query`, {
    method: "POST",
    headers: NOTION_HEADERS,
    body: JSON.stringify({ page_size: limit, sorts: [{ property: "CollectedAt", direction: "descending" }] }),
  })
  if (!res.ok) throw new Error(`Notion query ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const ids = []
  for (const p of data.results ?? []) {
    const rt = p.properties?.PostId?.rich_text ?? []
    const id = rt.map((r) => r.plain_text ?? "").join("")
    if (id) ids.push(id)
  }
  return ids
}

async function insertPage(item, collectedAtISO) {
  const res = await fetch(`${NOTION_BASE}/pages`, {
    method: "POST",
    headers: NOTION_HEADERS,
    body: JSON.stringify({
      parent: { database_id: NOTION_DB },
      properties: toNotionProperties(item, collectedAtISO),
    }),
  })
  if (!res.ok) throw new Error(`Notion insert ${res.status}: ${await res.text()}`)
}

async function gather(platform, fn, handles) {
  const all = []
  for (const h of handles) {
    try {
      const items = await fn(h)
      log(`${platform} @${h}: ${items.length}건 수집`)
      all.push(...items)
    } catch (e) {
      log(`${platform} @${h} 실패 (스킵):`, e.message)
    }
  }
  return all
}

async function main() {
  if (!NOTION_TOKEN || !NOTION_DB) {
    log("환경변수 누락: NOTION_TOKEN / NOTION_SOCIAL_DB_ID")
    process.exit(1)
  }
  const collectedAt = new Date().toISOString()

  const collected = [
    ...(await gather("threads", collectThreads, ACCOUNTS.threads)),
  ]
  log(`총 수집 ${collected.length}건`)

  let existing = []
  try {
    existing = await fetchExistingPostIds(100)
  } catch (e) {
    log("기존 PostId 조회 실패 — 중복 위험 있지만 진행:", e.message)
  }

  const fresh = dedupeByPostId(collected, existing)
  log(`신규 ${fresh.length}건 적재 시작`)

  let ok = 0
  for (const item of fresh) {
    try {
      await insertPage(item, collectedAt)
      ok++
    } catch (e) {
      log("적재 실패 (스킵):", item.postId, e.message)
    }
  }
  log(`완료: ${ok}/${fresh.length}건 적재`)
}

main().catch((e) => {
  log("치명적 오류:", e)
  process.exit(1)
})
