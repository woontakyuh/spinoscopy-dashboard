// scripts/journal-collector/crossref-gap.ts
// 매일 6개 코어 저널의 "PubMed 가 아직 색인 못 한 신규"를 CrossRef(ISSN)로 잡는다.
// 사이트 스크랩(WAF/URL 취약) 대신 CrossRef 로 6저널 균일 커버. dedup vs Notion →
// 분류 → 생성(ingestExternalArticles) → 신규 필독은 별도 짧은 메일.
// env: NOTION_*, JOURNAL_ALERT_SMTP_*, GAP_DAYS(기본 4). DRY_RUN=1 이면 생성/발송 안 함.
import nodemailer from "nodemailer"
import {
  ingestExternalArticles, classifyInterest, titleKey, doiKey,
} from "../../lib/journal-alert/pipeline"
import { alertSubject, alertWrap, articleItem, articleList, escHtml, notionPageUrl } from "../../lib/journal-alert/mailTemplate"
import { notionEnv } from "../../lib/notion/client"

const DRY = process.env.DRY_RUN === "1"
const DAYS = Number(process.env.GAP_DAYS ?? "4")
const MAIL = process.env.JOURNAL_ALERT_RECIPIENT || process.env.JOURNAL_ALERT_SMTP_USER || "noreply@example.com"

// ISSN + DOI-prefix → DB 약칭. (CrossRef container-title 대신 prefix 로 일관 매핑)
const JOURNALS = [
  { name: "TSJ", issn: "1529-9430", prefix: "10.1016" },
  { name: "Spine", issn: "0362-2436", prefix: "10.1097" },
  { name: "JNS Spine", issn: "1547-5654", prefix: "10.3171" },
  { name: "ESJ", issn: "0940-6719", prefix: "10.1007" },
  { name: "GSJ", issn: "2192-5682", prefix: "10.1177" },
  { name: "Neurospine", issn: "2586-6583", prefix: "10.14245" },
]
const JUNK = /^(table of contents|editorial board|meetings? calendar|masthead|cover|front matter|back matter|information for (readers|authors)|index|issue information|contents|subscription|abstracts?$)/i
const stripTags = (s: string) => (s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()

const NOTION_TOKEN = process.env.NOTION_TOKEN
const DB = notionEnv("NOTION_JOURNAL_DB_ID")
const NH = { Authorization: `Bearer ${NOTION_TOKEN}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" }

interface Article {
  pmid: string; title: string; authors: string; abstract: string; doiUrl: string
  journalName: string; pubDate: string; pubTypes: string[]; affiliations: string
  keywords: string[]; volume: string; issue: string
}

async function loadNotionKeys(): Promise<Set<string>> {
  const keys = new Set<string>()
  let cursor: string | undefined
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${DB}/query`, {
      method: "POST", headers: NH, body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    })
    const j: any = await res.json()
    if (j.object === "error") throw new Error(`Notion: ${j.message}`)
    for (const p of j.results) {
      const t = (p.properties?.Title?.title || []).map((x: any) => x.plain_text).join("")
      if (t) keys.add(titleKey(t))
      const d = p.properties?.DOI?.url
      if (d) keys.add(d.replace(/^https?:\/\/doi\.org\//, "").toLowerCase())
    }
    cursor = j.has_more ? j.next_cursor : undefined
  } while (cursor)
  return keys
}

function fmt(d: Date) { return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}` }

async function fetchCrossref(j: { name: string; issn: string; prefix: string }): Promise<Article[]> {
  const from = fmt(new Date(Date.now() - DAYS * 864e5))
  const until = fmt(new Date(Date.now() + 864e5))
  const url = `https://api.crossref.org/journals/${j.issn}/works?filter=from-pub-date:${from},until-pub-date:${until}` +
    `&rows=200&select=DOI,title,author,abstract,type,published-online,published-print&mailto=${MAIL}`
  const res = await fetch(url, { headers: { "User-Agent": `SpinoscopyDashboard/1.0 (mailto:${MAIL})` } })
  if (!res.ok) { console.error(`[gap] ${j.name} CrossRef ${res.status}`); return [] }
  const items = ((await res.json()) as any)?.message?.items || []
  const out: Article[] = []
  for (const it of items) {
    const title = (it.title && it.title[0]) || ""
    if (!title || JUNK.test(title.trim()) || it.type !== "journal-article") continue
    const authors = (it.author || []).map((a: any) => `${a.given ? a.given[0] + ". " : ""}${a.family || ""}`.trim()).filter(Boolean).join(", ")
    const pub = (it["published-online"] || it["published-print"])?.["date-parts"]?.[0] || []
    out.push({
      pmid: null as unknown as string, title, authors, abstract: stripTags(it.abstract).slice(0, 1900),
      doiUrl: it.DOI ? `https://doi.org/${(it.DOI as string).toLowerCase()}` : "",
      journalName: j.name, pubDate: pub.length ? `${pub[0]}-${String(pub[1] || 1).padStart(2, "0")}-${String(pub[2] || 1).padStart(2, "0")}` : "",
      pubTypes: [], affiliations: "", keywords: [], volume: "", issue: "",
    })
  }
  return out
}

async function emailMustReads(must: Article[], pageIdByKey: Map<string, string>) {
  const clean = (s?: string) => (s || "").replace(/\\n/g, "").replace(/["\r\n]/g, "").trim()
  const user = process.env.JOURNAL_ALERT_SMTP_USER
  const to = clean(process.env.JOURNAL_ALERT_RECIPIENT ?? user) || undefined
  const cc = clean(process.env.JOURNAL_ALERT_CC) || undefined
  const items = must.map((r) => {
    const pageId = pageIdByKey.get(r.doiUrl ? doiKey(r.doiUrl) : titleKey(r.title))
    return articleItem({
      href: r.doiUrl,
      title: r.title,
      notionUrl: pageId ? notionPageUrl(pageId) : undefined,
      subHtml: `${escHtml(r.authors)} · <b style="color:#111827;">${escHtml(r.journalName)}</b>${r.pubDate ? " · " + escHtml(r.pubDate) : ""}`,
    })
  }).join("")
  const html = alertWrap(
    `🔴 코어 저널 신규 필독 ${must.length}건`,
    ["PubMed 색인 전 · CrossRef 포착 — 정식 색인되면 메타데이터가 보강됩니다."],
    articleList(items)
  )
  const transport = nodemailer.createTransport({
    host: process.env.JOURNAL_ALERT_SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.JOURNAL_ALERT_SMTP_PORT ?? "587"), secure: false,
    auth: { user, pass: process.env.JOURNAL_ALERT_SMTP_PASS },
  })
  const info = await transport.sendMail({ from: user, to, cc, subject: alertSubject(`🔴 코어 저널 신규 필독 ${must.length}건 — PubMed 색인 전`), html })
  console.log("[gap] 필독 메일 발송:", info.messageId)
}

async function main() {
  if (!DB || !NOTION_TOKEN) throw new Error("NOTION_TOKEN/NOTION_JOURNAL_DB_ID 없음")
  const keys = await loadNotionKeys()
  const all: Article[] = []
  for (const j of JOURNALS) {
    const arts = await fetchCrossref(j)
    const fresh = arts.filter((a) => !keys.has(titleKey(a.title)) && !(a.doiUrl && keys.has(a.doiUrl.replace(/^https?:\/\/doi\.org\//, "").toLowerCase())))
    if (fresh.length) console.log(`[gap] ${j.name}: crossref=${arts.length}, 신규=${fresh.length}`)
    all.push(...fresh)
    await new Promise((r) => setTimeout(r, 300))
  }
  console.log(`[gap] 전체 신규(PubMed 미색인): ${all.length}`)
  const must = all.filter((a) => classifyInterest(a as any) === "🔴 필독")

  if (DRY) {
    console.log(`=== DRY RUN === 신규 ${all.length}, 필독 ${must.length}`)
    all.forEach((a) => console.log(`  [${a.journalName}] ${classifyInterest(a as any)} ${a.title.slice(0, 66)}`))
    return
  }
  if (all.length === 0) { console.log("[gap] 신규 없음"); return }
  const res = await ingestExternalArticles(DB, all as any)
  console.log("[gap] 적재:", JSON.stringify({ ...res, pages: res.pages.length }))
  const pageIdByKey = new Map<string, string>()
  for (const p of res.pages) pageIdByKey.set(p.doiUrl ? doiKey(p.doiUrl) : titleKey(p.title), p.pageId)
  if (must.length > 0) await emailMustReads(must, pageIdByKey)
}

main().catch((e) => { console.error("[gap] 실패:", e); process.exit(1) })
