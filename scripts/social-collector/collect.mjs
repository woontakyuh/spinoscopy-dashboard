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
} from "./normalize.mjs"

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
async function collectThreads(account) {
  let browser
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true })
    const ctx = await browser.newContext({ userAgent: UA, locale: "ko-KR" })
    const page = await ctx.newPage()
    await page.goto(`https://www.threads.com/@${account}`, { waitUntil: "domcontentloaded", timeout: 45000 })
    await page.waitForTimeout(6000)
    // 더 받기 위해 가볍게 스크롤
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 3000)
      await page.waitForTimeout(1500)
    }
    const raw = await page.evaluate((acct) => {
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
          account: acct,
          postId: m[1],
          text,
          url: href.startsWith("http") ? href : `https://www.threads.com${href}`,
          postedAtRaw: timeEl ? timeEl.getAttribute("datetime") : "",
        })
      })
      return out
    }, account)
    return raw.map((r) => ({
      platform: "threads",
      account: r.account,
      postId: r.postId,
      text: r.text,
      url: r.url,
      postedAt: normalizeDate(r.postedAtRaw),
    }))
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
