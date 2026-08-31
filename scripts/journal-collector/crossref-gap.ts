// scripts/journal-collector/crossref-gap.ts
// 매일 6개 코어 저널의 "PubMed 가 아직 색인 못 한 신규"를 CrossRef(ISSN)로 잡는다.
// 사이트 스크랩(WAF/URL 취약) 대신 CrossRef 로 6저널 균일 커버. dedup vs Notion →
// 분류 → 생성(ingestExternalArticles) → 신규 필독은 별도 짧은 메일.
// env: NOTION_*, JOURNAL_ALERT_SMTP_*, GAP_DAYS(기본 4). DRY_RUN=1 이면 생성/발송 안 함.

import { ingestExternalArticles, classifyInterest, titleKey } from "../../lib/journal-alert/pipeline"

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

interface Article { pmid: string; title: string; authors: string; abstract: string; doiUrl: string
journalName: string; pubDate: string; pubTypes: string[]; affiliations: string
keywords: string[]; volume: string; issue: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function loadNotionKeys(): Promise<Set<string>> {
  const keys = new Set<string>()
  let cursor: string | undefined
  do {
    const response = await fetch(`https://api.notion.com/v1/databases/${DB}/query`, {
      method: "POST",
      headers: NH,
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    })
    const payload: unknown = await response.json()
    if (!isRecord(payload)) throw new Error("Notion 응답 형식 오류")
    if (payload.object === "error") {
      const message = typeof payload.message === "string" ? payload.message : "unknown"
      throw new Error(`Notion: ${message}`)
    }
    const pages = Array.isArray(payload.results) ? payload.results : []
    for (const page of pages) {
      if (!isRecord(page) || !isRecord(page.properties)) continue
      const titleProperty = page.properties.Title
      const titleParts = isRecord(titleProperty) && Array.isArray(titleProperty.title)
        ? titleProperty.title
        : []
      const title = titleParts
        .map((part) => isRecord(part) && typeof part.plain_text === "string" ? part.plain_text : "")
        .join("")
      if (title) keys.add(titleKey(title))
      const doiProperty = page.properties.DOI
      const doi = isRecord(doiProperty) && typeof doiProperty.url === "string" ? doiProperty.url : ""
      if (doi) keys.add(doi.replace(/^https?:\/\/doi\.org\//, "").toLowerCase())
    }
    cursor = payload.has_more === true && typeof payload.next_cursor === "string"
      ? payload.next_cursor
      : undefined
  } while (cursor)
  return keys
}

function fmt(d: Date) { return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}` }

async function fetchCrossref(journal: { name: string; issn: string; prefix: string }): Promise<Article[]> {
  const from = fmt(new Date(Date.now() - DAYS * 864e5))
  const until = fmt(new Date(Date.now() + 864e5))
  const url = `https://api.crossref.org/journals/${journal.issn}/works?filter=from-pub-date:${from},until-pub-date:${until}` +
    `&rows=200&select=DOI,title,author,abstract,type,published-online,published-print&mailto=${MAIL}`
  const response = await fetch(url, {
    headers: { "User-Agent": `SpinoscopyDashboard/1.0 (mailto:${MAIL})` },
  })
  if (!response.ok) {
    console.error(`[gap] ${journal.name} CrossRef ${response.status}`)
    return []
  }
  const payload: unknown = await response.json()
  const message = isRecord(payload) && isRecord(payload.message) ? payload.message : undefined
  const items = message && Array.isArray(message.items) ? message.items : []
  const out: Article[] = []
  for (const item of items) {
    if (!isRecord(item)) continue
    const titleValues = Array.isArray(item.title) ? item.title : []
    const title = typeof titleValues[0] === "string" ? titleValues[0] : ""
    if (!title || JUNK.test(title.trim()) || item.type !== "journal-article") continue
    const authorValues = Array.isArray(item.author) ? item.author : []
    const authors = authorValues
      .map((author) => {
        if (!isRecord(author)) return ""
        const given = typeof author.given === "string" && author.given ? `${author.given[0]}. ` : ""
        const family = typeof author.family === "string" ? author.family : ""
        return `${given}${family}`.trim()
      })
      .filter(Boolean)
      .join(", ")
    const published = isRecord(item["published-online"])
      ? item["published-online"]
      : isRecord(item["published-print"])
        ? item["published-print"]
        : undefined
    const dateParts = published && Array.isArray(published["date-parts"])
      ? published["date-parts"]
      : []
    const publication = Array.isArray(dateParts[0]) ? dateParts[0] : []
    const doi = typeof item.DOI === "string" ? item.DOI : ""
    const abstract = typeof item.abstract === "string" ? item.abstract : ""
    out.push({
      pmid: "",
      title,
      authors,
      abstract: stripTags(abstract).slice(0, 1900),
      doiUrl: doi ? `https://doi.org/${doi.toLowerCase()}` : "",
      journalName: journal.name,
      pubDate: publication.length > 0
        ? `${publication[0]}-${String(publication[1] || 1).padStart(2, "0")}-${String(publication[2] || 1).padStart(2, "0")}`
        : "",
      pubTypes: [],
      affiliations: "",
      keywords: [],
      volume: "",
      issue: "",
    })
  }
  return out
}



async function main() {
  if (!DB || !NOTION_TOKEN) throw new Error("NOTION_TOKEN/NOTION_JOURNAL_DB_ID 없음")
  const keys = await loadNotionKeys()
  const all: Article[] = []
  for (const journal of JOURNALS) {
    const articles = await fetchCrossref(journal)
    const fresh = articles.filter((article) =>
      !keys.has(titleKey(article.title)) &&
      !(article.doiUrl && keys.has(article.doiUrl.replace(/^https?:\/\/doi\.org\//, "").toLowerCase()))
    )
    if (fresh.length) console.log(`[gap] ${journal.name}: crossref=${articles.length}, 신규=${fresh.length}`)
    all.push(...fresh)
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  console.log(`[gap] 전체 신규(PubMed 미색인): ${all.length}`)
  const must = all.filter((article) => classifyInterest(article) === "🔴 필독")

  if (DRY) {
    console.log(`=== DRY RUN === 신규 ${all.length}, 필독 ${must.length}`)
    all.forEach((article) =>
      console.log(`  [${article.journalName}] ${classifyInterest(article)} ${article.title.slice(0, 66)}`)
    )
    return
  }
  if (all.length === 0) {
    console.log("[gap] 신규 없음")
    return
  }
  const result = await ingestExternalArticles(DB, all)
  console.log("[gap] 적재:", JSON.stringify({ ...result, pages: result.pages.length }))
}

main().catch((e) => { console.error("[gap] 실패:", e); process.exit(1) })
