import nodemailer from "nodemailer"
import { notionRequest } from "@/lib/notion/client"
import {
  INTEREST_KEYWORDS,
  JOURNAL_SOURCES,
  LOW_PRIORITY_TYPES,
  MUST_READ_KEYWORDS,
} from "@/lib/journal-alert/config"

type InterestLevel = "🔴 필독" | "🟡 관심" | "⚪ 참고"

interface PubmedArticle {
  pmid: string
  title: string
  authors: string
  abstract: string
  doiUrl: string
  journalName: string
  pubDate: string
  pubTypes: string[]
}

interface NotionQueryResponse {
  results: Array<{
    id: string
    properties: Record<string, unknown>
  }>
  has_more: boolean
  next_cursor: string | null
}

interface NotionCreateResponse {
  id: string
}

export interface JournalAlertRunResult {
  fetched: number
  inserted: number
  skipped: number
  emailed: boolean
  subject?: string
  emailSkippedReason?: string
  emailShownCount?: number
  existingKeysCount?: number
  migrated?: number
}

interface EmailSendResult {
  sent: boolean
  subject?: string
  reason?: string
  shownCount: number
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function stripTags(text: string): string {
  return decodeXml(text).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

function extractFirst(xml: string, pattern: RegExp): string {
  const match = pattern.exec(xml)
  return match ? stripTags(match[1] ?? "") : ""
}

function extractAll(xml: string, pattern: RegExp): string[] {
  const out: string[] = []
  const regex = new RegExp(pattern.source, pattern.flags)
  let match = regex.exec(xml)
  while (match) {
    out.push(stripTags(match[1] ?? ""))
    match = regex.exec(xml)
  }
  return out.filter(Boolean)
}

function normalizeMonth(value: string): string {
  const monthMap: Record<string, string> = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  }
  const lower = value.trim().toLowerCase().slice(0, 3)
  if (monthMap[lower]) return monthMap[lower]
  if (/^\d+$/.test(value)) return value.padStart(2, "0")
  return ""
}

function extractPubDate(articleXml: string): string {
  const articleDate = /<ArticleDate>[\s\S]*?<Year>([^<]+)<\/Year>([\s\S]*?)<\/ArticleDate>/.exec(articleXml)
  if (articleDate) {
    const year = stripTags(articleDate[1] ?? "")
    const month = extractFirst(articleDate[2] ?? "", /<Month>([^<]+)<\/Month>/)
    const day = extractFirst(articleDate[2] ?? "", /<Day>([^<]+)<\/Day>/)
    if (year) {
      const parts = [year]
      const mm = normalizeMonth(month)
      if (mm) parts.push(mm)
      if (day) parts.push(day.padStart(2, "0"))
      return parts.join("-")
    }
  }

  const pubDate = /<PubDate>([\s\S]*?)<\/PubDate>/.exec(articleXml)
  if (!pubDate) return ""
  const body = pubDate[1] ?? ""
  const year = extractFirst(body, /<Year>([^<]+)<\/Year>/)
  const month = normalizeMonth(extractFirst(body, /<Month>([^<]+)<\/Month>/))
  const day = extractFirst(body, /<Day>([^<]+)<\/Day>/)
  if (!year) return ""
  const parts = [year]
  if (month) parts.push(month)
  if (day) parts.push(day.padStart(2, "0"))
  return parts.join("-")
}

function parseAuthorList(articleXml: string): string {
  const authorBlocks = articleXml.match(/<Author[^>]*>[\s\S]*?<\/Author>/g) ?? []
  const names = authorBlocks
    .map((author) => {
      const last = extractFirst(author, /<LastName>([^<]+)<\/LastName>/)
      const initials = extractFirst(author, /<Initials>([^<]+)<\/Initials>/)
      if (!last) return ""
      return `${last} ${initials}`.trim()
    })
    .filter(Boolean)
  if (names.length === 0) return ""
  if (names.length <= 3) return names.join(", ")
  return `${names.slice(0, 3).join(", ")} et al.`
}

function parsePubmedXml(xml: string): PubmedArticle[] {
  const blocks = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) ?? []
  return blocks
    .map((block) => {
      const pmid = extractFirst(block, /<PMID[^>]*>([^<]+)<\/PMID>/)
      const titleRaw = extractFirst(block, /<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/)
      const abstractParts = extractAll(block, /<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)
      const abstract = abstractParts.join(" ").trim()
      const doi = extractFirst(block, /<ArticleId IdType="doi">([^<]+)<\/ArticleId>/)
      const journalName =
        extractFirst(block, /<ISOAbbreviation>([^<]+)<\/ISOAbbreviation>/) ||
        extractFirst(block, /<Title>([^<]+)<\/Title>/)
      const pubTypes = extractAll(block, /<PublicationType[^>]*>([^<]+)<\/PublicationType>/g)

      return {
        pmid,
        title: titleRaw,
        authors: parseAuthorList(block),
        abstract,
        doiUrl: doi ? `https://doi.org/${doi}` : "",
        journalName,
        pubDate: extractPubDate(block),
        pubTypes,
      }
    })
    .filter((article) => article.title.length > 0)
}

function classifyInterest(article: PubmedArticle): InterestLevel {
  const text = [article.title, article.abstract, article.journalName].join(" ").toLowerCase()
  const lowPriority = article.pubTypes.some((t) =>
    LOW_PRIORITY_TYPES.some((needle) => t.toLowerCase().includes(needle))
  )
  if (lowPriority) return "⚪ 참고"

  if (MUST_READ_KEYWORDS.some((k) => text.includes(k))) return "🔴 필독"
  const score = INTEREST_KEYWORDS.reduce((acc, k) => (text.includes(k) ? acc + 1 : acc), 0)
  if (score >= 2) return "🔴 필독"
  if (score >= 1) return "🟡 관심"
  return "⚪ 참고"
}

async function searchPubmedIds(query: string, days: number): Promise<string[]> {
  const now = new Date()
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const fmt = (date: Date) =>
    `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(date.getUTCDate()).padStart(2, "0")}`

  const term = `"${query}"[journal]`
  const url =
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed` +
    `&term=${encodeURIComponent(term)}` +
    `&datetype=edat&mindate=${fmt(start)}&maxdate=${fmt(now)}` +
    `&retmax=500&retmode=json`

  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "SpinoscopyDashboard/1.0" } })
  if (!res.ok) throw new Error(`PubMed search failed: ${res.status}`)

  const payload = (await res.json()) as { esearchresult?: { idlist?: string[] } }
  return payload.esearchresult?.idlist ?? []
}

async function fetchPubmedArticles(pmids: string[]): Promise<PubmedArticle[]> {
  if (pmids.length === 0) return []
  const chunks: string[][] = []
  for (let i = 0; i < pmids.length; i += 50) chunks.push(pmids.slice(i, i + 50))

  const all: PubmedArticle[] = []
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const url =
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi" +
      `?db=pubmed&id=${encodeURIComponent(chunk.join(","))}&retmode=xml`
    const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "SpinoscopyDashboard/1.0" } })
    if (!res.ok) throw new Error(`PubMed fetch failed: ${res.status}`)
    const xml = await res.text()
    all.push(...parsePubmedXml(xml))
    if (i < chunks.length - 1) await new Promise((r) => setTimeout(r, 400))
  }
  return all
}

function titleKey(title: string): string {
  return title.trim().toLowerCase().slice(0, 80)
}

function pubDateMillis(value: string): number {
  if (!value) return 0
  const millis = Date.parse(value)
  return Number.isNaN(millis) ? 0 : millis
}

function interestRank(article: PubmedArticle): number {
  const level = classifyInterest(article)
  if (level === "🔴 필독") return 3
  if (level === "🟡 관심") return 2
  return 1
}

function selectEmailArticles(articles: PubmedArticle[]): PubmedArticle[] {
  // 신규 등록 논문 전부를 이메일에 포함. interest 순 → 날짜 순으로만 정렬.
  // 비상 상한 (Gmail 렌더링 한계 등) 만 환경변수로 둠 — 지정 안 하면 무제한.
  const maxItemsEnv = process.env.JOURNAL_ALERT_MAX_EMAIL_ITEMS
  const cap = maxItemsEnv ? Number(maxItemsEnv) : Number.POSITIVE_INFINITY

  const sorted = [...articles].sort((a, b) => {
    const rankDiff = interestRank(b) - interestRank(a)
    if (rankDiff !== 0) return rankDiff
    return pubDateMillis(b.pubDate) - pubDateMillis(a.pubDate)
  })
  return Number.isFinite(cap) && cap > 0 ? sorted.slice(0, Math.floor(cap)) : sorted
}

async function loadExistingKeys(databaseId: string): Promise<Set<string>> {
  const existing = new Set<string>()
  let hasMore = true
  let nextCursor: string | null = null

  while (hasMore) {
    const body: Record<string, unknown> = { page_size: 100 }
    if (nextCursor) body.start_cursor = nextCursor

    const resp = await notionRequest<NotionQueryResponse>(`/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    })

    for (const row of resp.results) {
      const props = row.properties
      const doi = (props.DOI as { url?: string } | undefined)?.url
      if (doi) existing.add(doi)
      const title =
        (props.Title as { title?: Array<{ plain_text?: string }> } | undefined)?.title?.[0]
          ?.plain_text ?? ""
      if (title) existing.add(titleKey(title))
      // PMID 추가 - DOI 없는 논문도 PMID로 dedup
      const pmid =
        (props.PMID as { rich_text?: Array<{ plain_text?: string }> } | undefined)
          ?.rich_text?.[0]?.plain_text ?? ""
      if (pmid) existing.add(`pmid:${pmid}`)
    }

    hasMore = resp.has_more
    nextCursor = resp.next_cursor
  }

  return existing
}

async function createJournalPage(databaseId: string, article: PubmedArticle): Promise<string> {
  const interest = classifyInterest(article)
  const summary = article.abstract.slice(0, 150)

  const properties: Record<string, unknown> = {
    Title: {
      title: [{ text: { content: article.title.slice(0, 2000) } }],
    },
    Author: {
      rich_text: [{ text: { content: article.authors.slice(0, 2000) } }],
    },
    "Journal Name": {
      select: article.journalName ? { name: article.journalName.slice(0, 100) } : null,
    },
    Summary: {
      rich_text: [{ text: { content: summary } }],
    },
    관심도: {
      select: { name: interest },
    },
    읽음: {
      checkbox: false,
    },
    Alerted: {
      checkbox: false,
    },
    Type: {
      select: { name: "Clinical Study" },
    },
  }

  if (article.doiUrl) properties.DOI = { url: article.doiUrl }
  if (article.pubDate) properties["Publication Date"] = { date: { start: article.pubDate } }
  if (article.pmid) properties.PMID = { rich_text: [{ text: { content: article.pmid } }] }

  const cleanProps = Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== null)
  )

  const body = {
    parent: { database_id: databaseId },
    properties: cleanProps,
    children: article.abstract
      ? [
          {
            object: "block",
            type: "heading_2",
            heading_2: {
              rich_text: [{ type: "text", text: { content: "Abstract" } }],
            },
          },
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ type: "text", text: { content: article.abstract.slice(0, 2000) } }],
            },
          },
        ]
      : undefined,
  }

  const created = await notionRequest<NotionCreateResponse>("/pages", {
    method: "POST",
    body: JSON.stringify(body),
  })
  return created.id
}

// 이메일 발송된 논문들을 Alerted=true로 마크 (파일시스템 레저 대체)
async function markArticlesAsAlerted(pageIds: string[]): Promise<void> {
  const BATCH_SIZE = 5
  for (let i = 0; i < pageIds.length; i += BATCH_SIZE) {
    const batch = pageIds.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map((id) =>
        notionRequest(`/pages/${id}`, {
          method: "PATCH",
          body: JSON.stringify({
            properties: { Alerted: { checkbox: true } },
          }),
        })
      )
    )
  }
}

// 일회성 마이그레이션: 기존 논문 전체를 Alerted=true로 설정
export async function migrateMarkAllAlerted(databaseId: string): Promise<number> {
  let marked = 0
  let hasMore = true
  let nextCursor: string | null = null

  while (hasMore) {
    const body: Record<string, unknown> = {
      page_size: 100,
      filter: {
        property: "Alerted",
        checkbox: { equals: false },
      },
    }
    if (nextCursor) body.start_cursor = nextCursor

    const resp = await notionRequest<NotionQueryResponse>(`/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    })

    const pageIds = resp.results.map((r) => r.id).filter(Boolean)
    if (pageIds.length > 0) {
      await markArticlesAsAlerted(pageIds)
      marked += pageIds.length
    }

    hasMore = resp.has_more
    nextCursor = resp.next_cursor
  }

  return marked
}

function buildEmailHtml(totalInserted: number, articlesForEmail: PubmedArticle[]): { subject: string; html: string } {
  const today = new Date().toISOString().slice(0, 10)
  const grouped = {
    must: [] as PubmedArticle[],
    interest: [] as PubmedArticle[],
    ref: [] as PubmedArticle[],
  }

  for (const article of articlesForEmail) {
    const interest = classifyInterest(article)
    if (interest === "🔴 필독") grouped.must.push(article)
    else if (interest === "🟡 관심") grouped.interest.push(article)
    else grouped.ref.push(article)
  }

  const subject = `[Journal Alert] ${today} 새 논문 ${totalInserted}편`

  const row = (a: PubmedArticle, idx: number) =>
    `<tr><td style="padding:6px 8px;color:#999;">${idx}</td><td style="padding:6px 8px;"><a href="${a.doiUrl}" style="color:#e5e7eb;text-decoration:none;">${a.title}</a><div style="font-size:11px;color:#a1a1aa;">${a.authors} · ${a.journalName}</div></td></tr>`

  const section = (title: string, items: PubmedArticle[]) => {
    if (items.length === 0) return ""
    return `<h3 style="color:#fafafa;border-bottom:1px solid #333;padding-bottom:6px;">${title} (${items.length})</h3><table style="width:100%;border-collapse:collapse;">${items
      .map((article, idx) => row(article, idx + 1))
      .join("")}</table>`
  }

  const totalShown = grouped.must.length + grouped.interest.length + grouped.ref.length
  const summaryLine = totalInserted === totalShown
    ? `총 신규 ${totalInserted}편`
    : `총 신규 ${totalInserted}편 중 ${totalShown}편 표시`
  const html = `<!doctype html><html><body style="background:#09090b;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><div style="max-width:680px;margin:0 auto;padding:24px;"><h1 style="margin:0 0 8px;">📚 Journal Alert</h1><p style="margin:0 0 16px;color:#a1a1aa;">${today}</p><p style="margin:0 0 16px;color:#a1a1aa;font-size:12px;">${summaryLine}</p>${section("🔴 필독", grouped.must)}${section("🟡 관심", grouped.interest)}${section("⚪ 참고", grouped.ref)}</div></body></html>`
  return { subject, html }
}

async function sendEmailAlert(
  insertedWithIds: Array<{ article: PubmedArticle; pageId: string }>
): Promise<EmailSendResult> {
  const user = process.env.JOURNAL_ALERT_SMTP_USER
  const pass = process.env.JOURNAL_ALERT_SMTP_PASS
  const host = process.env.JOURNAL_ALERT_SMTP_HOST ?? "smtp.gmail.com"
  const port = Number(process.env.JOURNAL_ALERT_SMTP_PORT ?? "587")
  const to = process.env.JOURNAL_ALERT_RECIPIENT ?? user
  const cc = process.env.JOURNAL_ALERT_CC?.trim() || undefined

  const allPageIds = insertedWithIds.map(({ pageId }) => pageId)

  if (!user || !pass || !to) {
    // 이메일 미설정 시에도 Alerted 마크 (재전송 방지)
    await markArticlesAsAlerted(allPageIds)
    return { sent: false, reason: "email_not_configured", shownCount: 0 }
  }

  const allArticles = insertedWithIds.map(({ article }) => article)
  const articles = selectEmailArticles(allArticles)
  const { subject, html } = buildEmailHtml(allArticles.length, articles)

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })

  await transporter.sendMail({
    from: user,
    to,
    cc,
    subject,
    html,
  })

  // 발송 성공 후 전체 삽입 논문 Alerted=true 마크 (재전송 방지)
  await markArticlesAsAlerted(allPageIds)
  return { sent: true, subject, shownCount: articles.length }
}

export async function runJournalAlertPipeline(days: number): Promise<JournalAlertRunResult> {
  const databaseId = process.env.NOTION_JOURNAL_DB_ID?.trim()
  if (!databaseId) throw new Error("NOTION_JOURNAL_DB_ID missing")

  const existing = await loadExistingKeys(databaseId)

  // PubMed rate limit (3 req/s without API key) 회피 위해 순차 처리 + 딜레이
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  const fetchedByJournal: PubmedArticle[][] = []
  for (const source of JOURNAL_SOURCES) {
    const ids = await searchPubmedIds(source.pubmedQuery, days)
    await sleep(400)
    const articles = await fetchPubmedArticles(ids)
    fetchedByJournal.push(
      articles.map((article) => ({ ...article, journalName: source.name || article.journalName }))
    )
    await sleep(400)
  }

  const fetched = fetchedByJournal.flat()
  const dedupedMap = new Map<string, PubmedArticle>()
  for (const article of fetched) {
    const key = article.doiUrl || `pmid:${article.pmid}` || titleKey(article.title)
    if (!key) continue
    if (!dedupedMap.has(key)) dedupedMap.set(key, article)
  }

  const unique = Array.from(dedupedMap.values())
  const toInsert = unique.filter((article) => {
    const keyByTitle = titleKey(article.title)
    const pmidKey = article.pmid ? `pmid:${article.pmid}` : null
    // DOI, PMID, 제목 중 하나라도 이미 존재하면 제외
    return (
      !existing.has(article.doiUrl) &&
      !existing.has(keyByTitle) &&
      (!pmidKey || !existing.has(pmidKey))
    )
  })

  // 삽입하면서 page_id 추적
  const insertedWithIds: Array<{ article: PubmedArticle; pageId: string }> = []
  for (const article of toInsert) {
    const pageId = await createJournalPage(databaseId, article)
    if (article.doiUrl) existing.add(article.doiUrl)
    if (article.pmid) existing.add(`pmid:${article.pmid}`)
    existing.add(titleKey(article.title))
    insertedWithIds.push({ article, pageId })
  }

  let emailResult: EmailSendResult = { sent: false, shownCount: 0 }
  if (insertedWithIds.length > 0) {
    emailResult = await sendEmailAlert(insertedWithIds)
  }

  return {
    fetched: unique.length,
    inserted: toInsert.length,
    skipped: unique.length - toInsert.length,
    emailed: emailResult.sent,
    subject: emailResult.subject,
    emailSkippedReason: emailResult.reason,
    emailShownCount: emailResult.shownCount,
    existingKeysCount: existing.size,
  }
}
