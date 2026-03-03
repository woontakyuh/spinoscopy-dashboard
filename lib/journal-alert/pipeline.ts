import nodemailer from "nodemailer"
import crypto from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
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
}

interface EmailSendResult {
  sent: boolean
  subject?: string
  reason?: string
  shownCount: number
}

interface AlertLedgerRecord {
  key: string
  sentAt: string
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
    `&datetype=pdat&mindate=${fmt(start)}&maxdate=${fmt(now)}` +
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
  for (const chunk of chunks) {
    const url =
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi" +
      `?db=pubmed&id=${encodeURIComponent(chunk.join(","))}&retmode=xml`
    const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "SpinoscopyDashboard/1.0" } })
    if (!res.ok) throw new Error(`PubMed fetch failed: ${res.status}`)
    const xml = await res.text()
    all.push(...parsePubmedXml(xml))
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
  const maxItems = Number(process.env.JOURNAL_ALERT_MAX_EMAIL_ITEMS ?? "80")
  const safeMax = Number.isFinite(maxItems) && maxItems > 0 ? Math.min(Math.floor(maxItems), 200) : 80

  return [...articles]
    .sort((a, b) => {
      const rankDiff = interestRank(b) - interestRank(a)
      if (rankDiff !== 0) return rankDiff
      return pubDateMillis(b.pubDate) - pubDateMillis(a.pubDate)
    })
    .slice(0, safeMax)
}

function alertBatchKey(articles: PubmedArticle[]): string {
  const digestSource = [...articles]
    .map((article) => article.doiUrl || `pmid:${article.pmid}` || titleKey(article.title))
    .filter(Boolean)
    .sort()
    .join("\n")
  return crypto.createHash("sha256").update(digestSource).digest("hex")
}

function ledgerPath(): string {
  return path.join(os.homedir(), ".spinoscopy-dashboard", "journal-alert-sent.json")
}

async function readLedger(): Promise<AlertLedgerRecord[]> {
  const target = ledgerPath()
  try {
    const raw = await fs.readFile(target, "utf-8")
    const parsed = JSON.parse(raw) as { records?: AlertLedgerRecord[] }
    return parsed.records ?? []
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      return []
    }
    throw error
  }
}

async function writeLedger(records: AlertLedgerRecord[]): Promise<void> {
  const target = ledgerPath()
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, JSON.stringify({ records }, null, 2), "utf-8")
}

async function shouldSkipBatch(batchKey: string): Promise<boolean> {
  const cooldownHoursRaw = Number(process.env.JOURNAL_ALERT_EMAIL_COOLDOWN_HOURS ?? "72")
  const cooldownHours =
    Number.isFinite(cooldownHoursRaw) && cooldownHoursRaw > 0
      ? Math.min(Math.floor(cooldownHoursRaw), 24 * 30)
      : 72

  const records = await readLedger()
  const now = Date.now()
  const validAfter = now - cooldownHours * 60 * 60 * 1000
  return records.some((record) => {
    if (record.key !== batchKey) return false
    const sentMillis = Date.parse(record.sentAt)
    if (Number.isNaN(sentMillis)) return false
    return sentMillis >= validAfter
  })
}

async function recordBatchSent(batchKey: string): Promise<void> {
  const records = await readLedger()
  records.push({
    key: batchKey,
    sentAt: new Date().toISOString(),
  })
  const trimmed = records.slice(-500)
  await writeLedger(trimmed)
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
    Type: {
      select: { name: "Clinical Study" },
    },
  }

  if (article.doiUrl) properties.DOI = { url: article.doiUrl }
  if (article.pubDate) properties["Publication Date"] = { date: { start: article.pubDate } }

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
      .slice(0, 20)
      .map((article, idx) => row(article, idx + 1))
      .join("")}</table>`
  }

  const html = `<!doctype html><html><body style="background:#09090b;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><div style="max-width:680px;margin:0 auto;padding:24px;"><h1 style="margin:0 0 8px;">📚 Journal Alert</h1><p style="margin:0 0 16px;color:#a1a1aa;">${today}</p><p style="margin:0 0 16px;color:#a1a1aa;font-size:12px;">총 신규 ${totalInserted}편 중 상위 ${articlesForEmail.length}편만 표시</p>${section("🔴 필독", grouped.must)}${section("🟡 관심", grouped.interest)}<p style="color:#a1a1aa;font-size:12px;">⚪ 참고 ${grouped.ref.length}편</p></div></body></html>`
  return { subject, html }
}

async function sendEmailAlert(allInserted: PubmedArticle[]): Promise<EmailSendResult> {
  const user = process.env.JOURNAL_ALERT_SMTP_USER
  const pass = process.env.JOURNAL_ALERT_SMTP_PASS
  const host = process.env.JOURNAL_ALERT_SMTP_HOST ?? "smtp.gmail.com"
  const port = Number(process.env.JOURNAL_ALERT_SMTP_PORT ?? "587")
  const to = process.env.JOURNAL_ALERT_RECIPIENT ?? user
  if (!user || !pass || !to) {
    return { sent: false, reason: "email_not_configured", shownCount: 0 }
  }

  const articles = selectEmailArticles(allInserted)
  const batchKey = alertBatchKey(articles)
  if (await shouldSkipBatch(batchKey)) {
    return { sent: false, reason: "duplicate_batch_blocked", shownCount: articles.length }
  }

  const { subject, html } = buildEmailHtml(allInserted.length, articles)

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })

  await transporter.sendMail({
    from: user,
    to,
    subject,
    html,
  })

  await recordBatchSent(batchKey)
  return { sent: true, subject, shownCount: articles.length }
}

export async function runJournalAlertPipeline(days: number): Promise<JournalAlertRunResult> {
  const databaseId = process.env.NOTION_JOURNAL_DB_ID
  if (!databaseId) throw new Error("NOTION_JOURNAL_DB_ID missing")

  const existing = await loadExistingKeys(databaseId)
  const fetchedByJournal = await Promise.all(
    JOURNAL_SOURCES.map(async (source) => {
      const ids = await searchPubmedIds(source.pubmedQuery, days)
      const articles = await fetchPubmedArticles(ids)
      return articles.map((article) => ({ ...article, journalName: source.name || article.journalName }))
    })
  )

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
    return !existing.has(article.doiUrl) && !existing.has(keyByTitle)
  })

  for (const article of toInsert) {
    await createJournalPage(databaseId, article)
    if (article.doiUrl) existing.add(article.doiUrl)
    existing.add(titleKey(article.title))
  }

  let emailResult: EmailSendResult = { sent: false, shownCount: 0 }
  if (toInsert.length > 0) {
    emailResult = await sendEmailAlert(toInsert)
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
