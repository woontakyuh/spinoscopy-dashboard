import nodemailer from "nodemailer"
import { notionRequest } from "@/lib/notion/client"
import {
  JOURNAL_SOURCES,
  LOW_PRIORITY_TYPES,
  MUST_READ_PATTERNS,
  STRONG_METHOD_PUBTYPES,
} from "@/lib/journal-alert/config"
import type { ScrapedArticle } from "./journalSite"

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
  affiliations: string
  keywords: string[]
  volume: string
  issue: string
}

// PubMed PublicationType → Notion Type select 매핑.
// 더 구체적인 타입이 우선 (예: Multicenter > Journal Article, Systematic Review > Review).
const PUBTYPE_PRIORITY: Array<{ match: string; notionType: string }> = [
  { match: "meta-analysis",                notionType: "Meta-analysis" },
  { match: "systematic review",            notionType: "Systematic Review" },
  { match: "randomized controlled trial",  notionType: "RCT" },
  { match: "multicenter study",            notionType: "Multicenter Study" },
  { match: "validation study",             notionType: "Validation Study" },
  { match: "observational study",          notionType: "Observational Study" },
  { match: "comparative study",            notionType: "Comparative Study" },
  { match: "case reports",                 notionType: "Case Report" },
  { match: "review",                       notionType: "Review" },
  { match: "letter",                       notionType: "Letter to Editor" },
  { match: "comment",                      notionType: "Letter to Editor" },
  { match: "editorial",                    notionType: "Editorial" },
  { match: "published erratum",            notionType: "Erratum" },
  { match: "erratum",                      notionType: "Erratum" },
]

function mapNotionType(pubTypes: string[]): string {
  const lowered = pubTypes.map((t) => t.toLowerCase())
  for (const { match, notionType } of PUBTYPE_PRIORITY) {
    if (lowered.some((t) => t.includes(match))) return notionType
  }
  return "Clinical Study"
}

// Notion multi_select 옵션 이름에는 콤마를 못 쓴다(API 400). PubMed <Keyword> 가
// "A,B, C" 식 콤마구분 목록을 한 항목에 통째로 담는 경우가 있어 → 콤마로 쪼개고
// trim·빈값제거·중복제거·100자 제한. Keywords/Category 쓰기 전 항상 통과시킨다.
export function toMultiSelectOptions(values: string[]): Array<{ name: string }> {
  const seen = new Set<string>()
  const out: Array<{ name: string }> = []
  for (const v of values) {
    for (const part of String(v).split(",")) {
      const name = part.trim().slice(0, 100)
      if (!name || seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      out.push({ name })
    }
  }
  return out
}

// title + abstract + keywords 에서 Category multi_select 옵션을 추정.
// Notion DB 의 14개 옵션과 동일하게 유지 — 새 옵션을 만들지 않음.
const CATEGORY_RULES: Array<{ category: string; matchers: string[] }> = [
  { category: "AI/ML",         matchers: ["machine learning", "deep learning", "artificial intelligence", "neural network", "large language model", "ai/ml", "convolutional", "transformer"] },
  { category: "Endoscopy",     matchers: ["endoscop", "biportal", "ube ", "ulbd", "uniportal", "full-endoscopic", "percutaneous endoscopic"] },
  { category: "MIS",           matchers: ["minimally invasive", " mis ", "miss ", "percutaneous", "tubular retract", "tlif"] },
  { category: "Deformity",     matchers: ["deformity", "scoliosis", "kyphosis", "spinal alignment", "sagittal balance", "pelvic incidence"] },
  { category: "Tumor",         matchers: ["tumor", "tumour", "metastasis", "metastatic", "schwannoma", "neoplas", "sarcoma", "hemangioma", "ependymoma", "meningioma"] },
  { category: "Complication",  matchers: ["complication", "adverse event", "morbidity", "infection", "reoperation", "revision surgery", "pseudarthrosis"] },
  { category: "Biomechanics",  matchers: ["biomech", "finite element", "fea ", "cadaver", "load", "kinematic", "stress analysis"] },
  { category: "Education",     matchers: ["education", "training", "curriculum", "learning curve", "simulator", "simulation"] },
  { category: "Outcome",       matchers: ["patient-reported outcome", "prom", "outcome measure", "quality of life", "odi", "ndi", "vas score", "satisfaction"] },
  { category: "Meta-analysis", matchers: ["meta-analysis", "systematic review", "pooled analysis"] },
  { category: "RCT",           matchers: ["randomized controlled trial", "rct ", "randomised controlled"] },
  { category: "Review",        matchers: ["narrative review", "scoping review", "review of literature"] },
  { category: "Lumbar",        matchers: ["lumbar", "l1-", "l2-", "l3-", "l4-", "l5-", "tlif", "plif", "alif"] },
  { category: "Cervical",      matchers: ["cervical", "c1-", "c2-", "c3-", "c4-", "c5-", "c6-", "c7-", "acdf", "acdr", "laminoplasty"] },
]

function deriveCategories(article: Pick<PubmedArticle, "title" | "abstract" | "keywords">): string[] {
  const text = `${article.title} ${article.abstract} ${article.keywords.join(" ")}`.toLowerCase()
  const matched: string[] = []
  for (const { category, matchers } of CATEGORY_RULES) {
    if (matchers.some((m) => text.includes(m))) matched.push(category)
  }
  // 최대 5개로 제한 — 너무 많이 붙으면 의미 약해짐
  return matched.slice(0, 5)
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

function parseAffiliations(block: string): string {
  // <Author> 블록마다 <AffiliationInfo><Affiliation>...</Affiliation></AffiliationInfo>
  const authorBlocks = block.match(/<Author[^>]*>[\s\S]*?<\/Author>/g) ?? []
  const seen = new Set<string>()
  const list: string[] = []
  for (const author of authorBlocks) {
    const affs = extractAll(author, /<Affiliation[^>]*>([\s\S]*?)<\/Affiliation>/g)
    for (const a of affs) {
      const clean = a.replace(/\s+/g, " ").trim()
      if (clean && !seen.has(clean)) {
        seen.add(clean)
        list.push(clean)
      }
    }
  }
  // 너무 길어지면 잘림 — Notion rich_text 최대 2000자 고려
  return list.join("; ").slice(0, 1900)
}

function parseKeywords(block: string): string[] {
  // <KeywordList><Keyword MajorTopicYN="N">...</Keyword></KeywordList>
  const raw = extractAll(block, /<Keyword[^>]*>([\s\S]*?)<\/Keyword>/g)
  const seen = new Set<string>()
  const result: string[] = []
  for (const k of raw) {
    const clean = k.replace(/\s+/g, " ").trim().slice(0, 100)
    if (!clean) continue
    const key = clean.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(clean)
    if (result.length >= 15) break
  }
  return result
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
      const volume = extractFirst(block, /<JournalIssue[^>]*>[\s\S]*?<Volume>([^<]+)<\/Volume>/)
      const issue = extractFirst(block, /<JournalIssue[^>]*>[\s\S]*?<Issue>([^<]+)<\/Issue>/)

      return {
        pmid,
        title: titleRaw,
        authors: parseAuthorList(block),
        abstract,
        doiUrl: doi ? `https://doi.org/${doi}` : "",
        journalName,
        pubDate: extractPubDate(block),
        pubTypes,
        affiliations: parseAffiliations(block),
        keywords: parseKeywords(block),
        volume,
        issue,
      }
    })
    .filter((article) => article.title.length > 0)
}

export function classifyInterest(article: PubmedArticle): InterestLevel {
  // 1) letter / editorial / erratum 류 → ⚪
  const lowerTypes = article.pubTypes.map((t) => t.toLowerCase())
  if (lowerTypes.some((t) => LOW_PRIORITY_TYPES.some((needle) => t.includes(needle)))) {
    return "⚪ 참고"
  }

  // 2) MUST_READ regex 매칭 → 🔴 필독 (단어 경계 적용된 패턴들이라 false-positive 적음)
  const text = `${article.title} ${article.abstract} ${article.journalName}`
  if (MUST_READ_PATTERNS.some((re) => re.test(text))) return "🔴 필독"

  // 3) 강한 방법론 (RCT / Meta-Analysis / Systematic Review) → 🟡 관심
  if (STRONG_METHOD_PUBTYPES.some((m) => lowerTypes.some((t) => t.includes(m)))) {
    return "🟡 관심"
  }

  // 4) 그 외 → ⚪ 참고 (옛 INTEREST_KEYWORDS 의 broad 매칭은 제거함)
  return "⚪ 참고"
}

async function searchPubmedIdsByDateType(
  query: string,
  days: number,
  datetype: "edat" | "pdat",
): Promise<string[]> {
  const now = new Date()
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const fmt = (date: Date) =>
    `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(date.getUTCDate()).padStart(2, "0")}`

  const term = `"${query}"[journal]`
  const url =
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed` +
    `&term=${encodeURIComponent(term)}` +
    `&datetype=${datetype}&mindate=${fmt(start)}&maxdate=${fmt(now)}` +
    `&retmax=500&retmode=json`

  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "SpinoscopyDashboard/1.0" } })
  if (!res.ok) throw new Error(`PubMed search (${datetype}) failed: ${res.status}`)

  const payload = (await res.json()) as { esearchresult?: { idlist?: string[] } }
  return payload.esearchresult?.idlist ?? []
}

// edat (Entrez 인덱싱일) 하나만 보면 TSJ 처럼 PubMed 인덱싱 lag 이 긴 저널 (60일 publish → 인덱싱은 며칠~몇주 후)
// 을 거의 다 놓침. pdat (실제 출판일) 도 함께 조회하고 PMID union — 이후 Notion dedup 으로 중복 제거.
async function searchPubmedIds(query: string, days: number): Promise<string[]> {
  const [edatIds, pdatIds] = await Promise.all([
    searchPubmedIdsByDateType(query, days, "edat"),
    searchPubmedIdsByDateType(query, days, "pdat"),
  ])
  return Array.from(new Set([...edatIds, ...pdatIds]))
}

// 저널 제약 없는 주제 검색 (topic-radar 용) — edat+pdat union.
export async function searchPubmedByTerm(term: string, days: number): Promise<string[]> {
  const now = new Date()
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`
  const run = async (datetype: "edat" | "pdat") => {
    const url =
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed` +
      `&term=${encodeURIComponent(term)}&datetype=${datetype}&mindate=${fmt(start)}&maxdate=${fmt(now)}` +
      `&retmax=200&retmode=json`
    const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "SpinoscopyDashboard/1.0" } })
    if (!res.ok) throw new Error(`PubMed term search (${datetype}) failed: ${res.status}`)
    const payload = (await res.json()) as { esearchresult?: { idlist?: string[] } }
    return payload.esearchresult?.idlist ?? []
  }
  const [edat, pdat] = await Promise.all([run("edat"), run("pdat")])
  return Array.from(new Set([...edat, ...pdat]))
}

export async function fetchPubmedArticles(pmids: string[]): Promise<PubmedArticle[]> {
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

export function minimalArticleFromScraped(s: ScrapedArticle): PubmedArticle {
  return {
    pmid: null as unknown as string,   // PubMed 미색인 — 기존 코드의 pmid 사용부는 falsy 가드 있음
    title: s.title,
    authors: s.authors,
    abstract: "",
    doiUrl: "",
    journalName: s.journalName,
    pubDate: s.postedAt ?? "",
    pubTypes: [],
    affiliations: "",
    keywords: [],
    volume: "",
    issue: "",
  }
}

// 제목 정확매칭으로 PubMed 단건 조회. 색인 전이면 null.
export async function searchPubmedByTitle(title: string, journal: string): Promise<PubmedArticle | null> {
  const safeTitle = title.replace(/"/g, " ")
  const term = `"${safeTitle}"[Title] AND "${journal}"[journal]`
  const url =
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed` +
    `&term=${encodeURIComponent(term)}&retmax=1&retmode=json`
  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "SpinoscopyDashboard/1.0" } })
  if (!res.ok) throw new Error(`PubMed title search failed: ${res.status}`)
  const payload = (await res.json()) as { esearchresult?: { idlist?: string[] } }
  const id = payload.esearchresult?.idlist?.[0]
  if (!id) return null
  const [article] = await fetchPubmedArticles([id])
  return article ?? null
}

export interface IngestResult { scraped: number; created: number; skipped: number; enriched: number; failed: number }

export async function ingestScrapedArticles(
  databaseId: string,
  scraped: ScrapedArticle[],
): Promise<IngestResult> {
  const existing = await loadExistingKeys(databaseId)
  let created = 0, skipped = 0, enriched = 0, failed = 0
  for (const s of scraped) {
    if (existing.has(titleKey(s.title))) { skipped++; continue }
    try {
      let article = await searchPubmedByTitle(s.title, s.journalName)
      if (article) enriched++; else article = minimalArticleFromScraped(s)
      await createJournalPage(databaseId, article)
      created++
      existing.add(titleKey(s.title))
    } catch (err) {
      failed++
      console.error(`[ingest] 실패: "${s.title}" —`, err instanceof Error ? err.message : err)
      continue
    }
    await new Promise((r) => setTimeout(r, 350))
  }
  return { scraped: scraped.length, created, skipped, enriched, failed }
}

// 외부 소스(CrossRef 등)에서 이미 메타데이터까지 갖춘 article 들을 적재.
// PubMed 가 아직 색인 못 한 누락분 보충용 — DOI/제목으로 dedup 후 분류·생성.
export async function ingestExternalArticles(
  databaseId: string,
  articles: PubmedArticle[],
): Promise<IngestResult> {
  const existing = await loadExistingKeys(databaseId)
  let created = 0, skipped = 0, failed = 0
  for (const a of articles) {
    if ((a.doiUrl && existing.has(a.doiUrl)) || existing.has(titleKey(a.title))) { skipped++; continue }
    try {
      await createJournalPage(databaseId, a)
      created++
      existing.add(titleKey(a.title))
      if (a.doiUrl) existing.add(a.doiUrl)
    } catch (err) {
      failed++
      console.error(`[ingest-external] 실패: "${a.title}" —`, err instanceof Error ? err.message : err)
      continue
    }
    await new Promise((r) => setTimeout(r, 350))
  }
  return { scraped: articles.length, created, skipped, enriched: 0, failed }
}

export function titleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80)
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

// PubmedArticle → Notion property payload. createJournalPage 와 백필(PATCH) 둘 다 사용.
function buildArticleProperties(article: PubmedArticle, opts: { forCreate: boolean } = { forCreate: true }): Record<string, unknown> {
  const interest = classifyInterest(article)
  const summary = article.abstract.slice(0, 150)
  const notionType = mapNotionType(article.pubTypes)
  const derivedCategories = deriveCategories(article)

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
    Abstract: {
      rich_text: article.abstract
        ? [{ text: { content: article.abstract.slice(0, 1900) } }]
        : [],
    },
    관심도: {
      select: { name: interest },
    },
    Type: {
      select: { name: notionType },
    },
  }

  // 신규 생성 시에만 기본값 — 패치 시 사용자가 만져놓은 읽음/Alerted 덮어쓰지 않도록.
  if (opts.forCreate) {
    properties.읽음 = { checkbox: false }
    properties.Alerted = { checkbox: false }
  }

  if (article.doiUrl) properties.DOI = { url: article.doiUrl }
  if (article.pubDate) properties["Publication Date"] = { date: { start: article.pubDate } }
  if (article.pmid) properties.PMID = { rich_text: [{ text: { content: article.pmid } }] }
  if (article.volume) properties.Vol = { rich_text: [{ text: { content: article.volume.slice(0, 100) } }] }
  if (article.issue) properties.Issue = { rich_text: [{ text: { content: article.issue.slice(0, 100) } }] }
  if (article.affiliations) properties.Affiliations = { rich_text: [{ text: { content: article.affiliations } }] }
  const keywordOpts = toMultiSelectOptions(article.keywords)
  if (keywordOpts.length > 0) properties.Keywords = { multi_select: keywordOpts }
  const categoryOpts = toMultiSelectOptions(derivedCategories)
  if (categoryOpts.length > 0) properties.Category = { multi_select: categoryOpts }

  return properties
}

async function createJournalPage(databaseId: string, article: PubmedArticle): Promise<string> {
  const properties = buildArticleProperties(article, { forCreate: true })

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

// 기존 row 중 PMID 있는 것들을 PubMed 로 재조회해서 누락 필드(Abstract/Keywords/Affiliations/Vol/Issue/Category/Type 미적용 등) 만 PATCH.
// 사용자가 손댄 필드는 덮어쓰지 않음 — empty 일 때만 채움.
interface BackfillResult {
  scanned: number
  patched: number
  skipped_no_pmid: number
  skipped_full: number
  failed: number
}

interface ExistingRow {
  pageId: string
  pmid: string
  hasAbstract: boolean
  hasKeywords: boolean
  hasAffiliations: boolean
  hasVol: boolean
  hasIssue: boolean
  hasCategory: boolean
  hasType: boolean
  currentType: string
}

async function loadRowsWithFieldStatus(databaseId: string): Promise<ExistingRow[]> {
  const rows: ExistingRow[] = []
  let cursor: string | null = null
  let hasMore = true
  while (hasMore) {
    const body: Record<string, unknown> = { page_size: 100 }
    if (cursor) body.start_cursor = cursor
    const resp = await notionRequest<NotionQueryResponse>(`/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    })
    for (const page of resp.results) {
      const props = page.properties as Record<string, {
        type: string
        rich_text?: Array<{ plain_text?: string }>
        multi_select?: Array<{ name: string }>
        select?: { name: string } | null
      }>
      const pmid = props.PMID?.rich_text?.[0]?.plain_text ?? ""
      const hasAbstract = (props.Abstract?.rich_text?.length ?? 0) > 0
      const hasKeywords = (props.Keywords?.multi_select?.length ?? 0) > 0
      const hasAffiliations = (props.Affiliations?.rich_text?.length ?? 0) > 0
      const hasVol = (props.Vol?.rich_text?.length ?? 0) > 0
      const hasIssue = (props.Issue?.rich_text?.length ?? 0) > 0
      const hasCategory = (props.Category?.multi_select?.length ?? 0) > 0
      const currentType = props.Type?.select?.name ?? ""
      // Clinical Study 는 옛 하드코딩 fallback — 더 구체적 타입으로 교체 후보로 간주
      const hasType = currentType !== "" && currentType !== "Clinical Study"
      rows.push({
        pageId: page.id, pmid, hasAbstract, hasKeywords, hasAffiliations,
        hasVol, hasIssue, hasCategory, hasType, currentType,
      })
    }
    hasMore = resp.has_more
    cursor = resp.next_cursor
  }
  return rows
}

// 기존 row 의 관심도(필독/관심/참고)를 새 룰로 재분류. PubMed 재조회 없이 Notion 자체 필드만 사용.
// classifyInterest 는 pubTypes 배열이 필요하지만 Notion 엔 단일 Type select 만 있으므로 매핑 변환.
export interface ReclassifyResult {
  scanned: number
  changed: number
  to_must: number
  to_interest: number
  to_ref: number
  unchanged: number
  failed: number
  emailed: boolean
  emailSkippedReason?: string
}

type NotionInterestLevel = "🔴 필독" | "🟡 관심" | "⚪ 참고"

interface RowForReclassify {
  pageId: string
  title: string
  abstract: string
  journalName: string
  notionType: string
  currentInterest: string
}

async function loadRowsForReclassify(databaseId: string): Promise<RowForReclassify[]> {
  const rows: RowForReclassify[] = []
  let cursor: string | null = null
  let hasMore = true
  while (hasMore) {
    const body: Record<string, unknown> = { page_size: 100 }
    if (cursor) body.start_cursor = cursor
    const resp = await notionRequest<NotionQueryResponse>(`/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    })
    for (const page of resp.results) {
      const props = page.properties as Record<string, {
        type: string
        title?: Array<{ plain_text?: string }>
        rich_text?: Array<{ plain_text?: string }>
        select?: { name: string } | null
      }>
      const title = (props.Title?.title ?? []).map((t) => t.plain_text ?? "").join("")
      const abstract = (props.Abstract?.rich_text ?? []).map((t) => t.plain_text ?? "").join("")
      const journalName = props["Journal Name"]?.select?.name ?? ""
      const notionType = props.Type?.select?.name ?? ""
      const currentInterest = props.관심도?.select?.name ?? ""
      rows.push({ pageId: page.id, title, abstract, journalName, notionType, currentInterest })
    }
    hasMore = resp.has_more
    cursor = resp.next_cursor
  }
  return rows
}

// Notion Type select 값을 classifyInterest 의 pubTypes 배열로 변환 (LOW_PRIORITY / STRONG_METHOD 매칭용)
function notionTypeToPubTypes(notionType: string): string[] {
  const map: Record<string, string[]> = {
    "Letter to Editor": ["Letter"],
    "Editorial": ["Editorial"],
    "Erratum": ["Published Erratum"],
    "Meta-analysis": ["Meta-Analysis"],
    "Systematic Review": ["Systematic Review"],
    "RCT": ["Randomized Controlled Trial"],
    "Multicenter Study": ["Multicenter Study"],
    "Observational Study": ["Observational Study"],
    "Comparative Study": ["Comparative Study"],
    "Validation Study": ["Validation Study"],
    "Review": ["Review"],
    "Case Report": ["Case Reports"],
    "Clinical Study": [],
  }
  return map[notionType] ?? []
}

export async function runReclassifyInterest(): Promise<ReclassifyResult> {
  const databaseId = process.env.NOTION_JOURNAL_DB_ID?.trim()
  if (!databaseId) throw new Error("NOTION_JOURNAL_DB_ID missing")

  const result: ReclassifyResult = {
    scanned: 0, changed: 0, to_must: 0, to_interest: 0, to_ref: 0,
    unchanged: 0, failed: 0, emailed: false,
  }

  const rows = await loadRowsForReclassify(databaseId)
  result.scanned = rows.length
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  // 변화 분포 추적 — old → new 그리드
  const movement: Record<string, number> = {}

  for (const row of rows) {
    const fakeArticle: PubmedArticle = {
      pmid: "", title: row.title, authors: "", abstract: row.abstract,
      doiUrl: "", journalName: row.journalName, pubDate: "",
      pubTypes: notionTypeToPubTypes(row.notionType),
      affiliations: "", keywords: [], volume: "", issue: "",
    }
    const newInterest = classifyInterest(fakeArticle) as NotionInterestLevel
    if (newInterest === row.currentInterest) {
      result.unchanged += 1
      continue
    }
    try {
      await notionRequest(`/pages/${row.pageId}`, {
        method: "PATCH",
        body: JSON.stringify({
          properties: { 관심도: { select: { name: newInterest } } },
        }),
      })
      result.changed += 1
      if (newInterest === "🔴 필독") result.to_must += 1
      else if (newInterest === "🟡 관심") result.to_interest += 1
      else result.to_ref += 1
      const key = `${row.currentInterest || "(empty)"} → ${newInterest}`
      movement[key] = (movement[key] ?? 0) + 1
      await sleep(120)
    } catch {
      result.failed += 1
    }
  }

  const email = await sendReclassifyReport(result, movement)
  result.emailed = email.sent
  if (email.reason) result.emailSkippedReason = email.reason
  return result
}

async function sendReclassifyReport(
  result: ReclassifyResult,
  movement: Record<string, number>,
): Promise<{ sent: boolean; reason?: string }> {
  const user = process.env.JOURNAL_ALERT_SMTP_USER
  const pass = process.env.JOURNAL_ALERT_SMTP_PASS
  const host = process.env.JOURNAL_ALERT_SMTP_HOST ?? "smtp.gmail.com"
  const port = Number(process.env.JOURNAL_ALERT_SMTP_PORT ?? "587")
  const to = process.env.JOURNAL_ALERT_RECIPIENT ?? user
  const cc = process.env.JOURNAL_ALERT_CC?.trim() || undefined
  if (!user || !pass || !to) return { sent: false, reason: "email_not_configured" }

  const today = new Date().toISOString().slice(0, 10)
  const subject = `[Journal Alert] 관심도 재분류 — ${result.changed}건 변경`
  const cell = (v: string | number) =>
    `<td style="padding:6px 10px;border-bottom:1px solid #2a2a2a;">${v}</td>`
  const moveRows = Object.entries(movement).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<tr>${cell(k)}${cell(`<span style="color:#fafafa;">${v}</span>건`)}</tr>`).join("")

  const html = `<!doctype html><html><body style="background:#09090b;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:680px;margin:0 auto;padding:24px;">
  <h1 style="margin:0 0 8px;">🔁 Journal 관심도 재분류 완료</h1>
  <p style="margin:0 0 16px;color:#a1a1aa;">${today}</p>
  <h3 style="color:#fafafa;border-bottom:1px solid #333;padding-bottom:6px;margin-top:24px;">전체</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <tr>${cell("스캔")}${cell(`<span style="color:#fafafa;">${result.scanned}</span>건`)}</tr>
    <tr>${cell("변경")}${cell(`<span style="color:#34d399;">${result.changed}</span>건`)}</tr>
    <tr>${cell("변경 없음")}${cell(`<span style="color:#a1a1aa;">${result.unchanged}</span>건`)}</tr>
    <tr>${cell("실패")}${cell(`<span style="color:${result.failed > 0 ? "#f87171" : "#a1a1aa"};">${result.failed}</span>건`)}</tr>
  </table>
  <h3 style="color:#fafafa;border-bottom:1px solid #333;padding-bottom:6px;margin-top:24px;">새 분류 분포</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <tr>${cell("🔴 필독으로 변경")}${cell(`<span style="color:#f87171;">${result.to_must}</span>건`)}</tr>
    <tr>${cell("🟡 관심으로 변경")}${cell(`<span style="color:#fbbf24;">${result.to_interest}</span>건`)}</tr>
    <tr>${cell("⚪ 참고로 변경")}${cell(`<span style="color:#a1a1aa;">${result.to_ref}</span>건`)}</tr>
  </table>
  ${Object.keys(movement).length > 0 ? `
  <h3 style="color:#fafafa;border-bottom:1px solid #333;padding-bottom:6px;margin-top:24px;">변화 매트릭스 (old → new)</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">${moveRows}</table>` : ""}
</div></body></html>`
  try {
    const transporter = nodemailer.createTransport({
      host, port, secure: port === 465, auth: { user, pass },
    })
    await transporter.sendMail({ from: user, to, cc, subject, html })
    return { sent: true }
  } catch (e) {
    return { sent: false, reason: `smtp_error: ${e instanceof Error ? e.message : "unknown"}` }
  }
}

export async function runBackfillFields(): Promise<BackfillResult & { emailed: boolean; emailSkippedReason?: string }> {
  const databaseId = process.env.NOTION_JOURNAL_DB_ID?.trim()
  if (!databaseId) throw new Error("NOTION_JOURNAL_DB_ID missing")

  // 필드별 patch 카운트를 따로 트래킹 — 메일 리포트에 어떤 필드가 얼마나 채워졌는지 보여줌
  const fieldStats: Record<string, number> = {
    Abstract: 0, Keywords: 0, Affiliations: 0, Vol: 0, Issue: 0, Category: 0, Type: 0,
  }
  const typeBreakdown: Record<string, number> = {}

  const result: BackfillResult = {
    scanned: 0, patched: 0, skipped_no_pmid: 0, skipped_full: 0, failed: 0,
  }
  const rows = await loadRowsWithFieldStatus(databaseId)
  result.scanned = rows.length

  // 보강 대상: PMID 있고, 누락된 필드가 1개라도 있는 row.
  const needsBackfill = rows.filter((r) => {
    if (!r.pmid) { result.skipped_no_pmid += 1; return false }
    const allHave = r.hasAbstract && r.hasKeywords && r.hasAffiliations
      && r.hasVol && r.hasIssue && r.hasCategory && r.hasType
    if (allHave) { result.skipped_full += 1; return false }
    return true
  })

  // PubMed 50개씩 효율적으로 조회 후 PMID → article 매핑
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  for (let i = 0; i < needsBackfill.length; i += 50) {
    const batch = needsBackfill.slice(i, i + 50)
    const pmids = batch.map((r) => r.pmid)
    let articles: PubmedArticle[] = []
    try {
      articles = await fetchPubmedArticles(pmids)
    } catch {
      result.failed += batch.length
      continue
    }
    const byPmid = new Map(articles.map((a) => [a.pmid, a]))

    for (const row of batch) {
      const article = byPmid.get(row.pmid)
      if (!article) { result.failed += 1; continue }
      try {
        const patch = buildBackfillPatch(article, row)
        if (Object.keys(patch).length === 0) { result.skipped_full += 1; continue }
        await notionRequest(`/pages/${row.pageId}`, {
          method: "PATCH",
          body: JSON.stringify({ properties: patch }),
        })
        result.patched += 1
        // 필드별 통계
        for (const key of Object.keys(patch)) {
          if (key in fieldStats) fieldStats[key] += 1
        }
        if (patch.Type) {
          const t = (patch.Type as { select: { name: string } }).select.name
          typeBreakdown[t] = (typeBreakdown[t] ?? 0) + 1
        }
        await sleep(120)
      } catch {
        result.failed += 1
      }
    }
    await sleep(400)
  }

  // 결과 메일 리포트 — 사용자가 결과를 메일로 받겠다고 요청.
  const email = await sendBackfillReport(result, fieldStats, typeBreakdown)
  return { ...result, emailed: email.sent, emailSkippedReason: email.reason }
}

// DOI 만 있고 PMID 없는 row 대상으로 PubMed esearch (doi → pmid) 후 패치까지 한 방에.
export interface DoiBackfillResult {
  scanned_no_pmid: number
  has_doi: number
  pmid_resolved: number
  patched: number
  failed_pmid_lookup: number
  failed_patch: number
  emailed: boolean
  emailSkippedReason?: string
}

interface DoiRow extends ExistingRow {
  doi: string
}

async function loadRowsForDoiBackfill(databaseId: string): Promise<DoiRow[]> {
  const rows: DoiRow[] = []
  let cursor: string | null = null
  let hasMore = true
  while (hasMore) {
    const body: Record<string, unknown> = { page_size: 100 }
    if (cursor) body.start_cursor = cursor
    const resp = await notionRequest<NotionQueryResponse>(`/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    })
    for (const page of resp.results) {
      const props = page.properties as Record<string, {
        type: string
        rich_text?: Array<{ plain_text?: string }>
        multi_select?: Array<{ name: string }>
        select?: { name: string } | null
        url?: string | null
      }>
      const pmid = props.PMID?.rich_text?.[0]?.plain_text ?? ""
      const doi = (props.DOI?.url ?? "").trim()
      if (pmid || !doi) continue
      const hasAbstract = (props.Abstract?.rich_text?.length ?? 0) > 0
      const hasKeywords = (props.Keywords?.multi_select?.length ?? 0) > 0
      const hasAffiliations = (props.Affiliations?.rich_text?.length ?? 0) > 0
      const hasVol = (props.Vol?.rich_text?.length ?? 0) > 0
      const hasIssue = (props.Issue?.rich_text?.length ?? 0) > 0
      const hasCategory = (props.Category?.multi_select?.length ?? 0) > 0
      const currentType = props.Type?.select?.name ?? ""
      const hasType = currentType !== "" && currentType !== "Clinical Study"
      rows.push({
        pageId: page.id, pmid: "", doi,
        hasAbstract, hasKeywords, hasAffiliations,
        hasVol, hasIssue, hasCategory, hasType, currentType,
      })
    }
    hasMore = resp.has_more
    cursor = resp.next_cursor
  }
  return rows
}

// DOI 문자열에서 (https://doi.org/) 접두 제거 + 공백 정리
function normalizeDoi(raw: string): string {
  return raw.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim()
}

async function pmidFromDoi(doi: string): Promise<string | null> {
  const clean = normalizeDoi(doi)
  if (!clean) return null
  const url =
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed` +
    `&term=${encodeURIComponent(`"${clean}"[doi]`)}` +
    `&retmax=1&retmode=json`
  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "SpinoscopyDashboard/1.0" } })
  if (!res.ok) return null
  const payload = (await res.json()) as { esearchresult?: { idlist?: string[] } }
  return payload.esearchresult?.idlist?.[0] ?? null
}

export async function runDoiBackfill(): Promise<DoiBackfillResult> {
  const databaseId = process.env.NOTION_JOURNAL_DB_ID?.trim()
  if (!databaseId) throw new Error("NOTION_JOURNAL_DB_ID missing")

  const result: DoiBackfillResult = {
    scanned_no_pmid: 0, has_doi: 0, pmid_resolved: 0,
    patched: 0, failed_pmid_lookup: 0, failed_patch: 0, emailed: false,
  }
  const fieldStats: Record<string, number> = {
    PMID: 0, Abstract: 0, Keywords: 0, Affiliations: 0, Vol: 0, Issue: 0, Category: 0, Type: 0,
  }
  const typeBreakdown: Record<string, number> = {}

  const rows = await loadRowsForDoiBackfill(databaseId)
  result.has_doi = rows.length
  // loadRowsForDoiBackfill 는 이미 doi 있는 row 만 반환 — no-pmid 카운트는 따로 추적해도 OK 지만
  // 사용자 보고용으로는 has_doi 만으로 충분
  result.scanned_no_pmid = rows.length

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  // Step 1: DOI → PMID 단건 esearch (PubMed rate limit 3 req/s 회피)
  const resolvedPairs: Array<{ row: DoiRow; pmid: string }> = []
  for (const row of rows) {
    try {
      const pmid = await pmidFromDoi(row.doi)
      if (pmid) {
        resolvedPairs.push({ row, pmid })
      } else {
        result.failed_pmid_lookup += 1
      }
    } catch {
      result.failed_pmid_lookup += 1
    }
    await sleep(340) // ~3 req/s
  }
  result.pmid_resolved = resolvedPairs.length

  // Step 2: PMID 50 개씩 efetch + 매핑
  for (let i = 0; i < resolvedPairs.length; i += 50) {
    const batch = resolvedPairs.slice(i, i + 50)
    const pmids = batch.map((p) => p.pmid)
    let articles: PubmedArticle[] = []
    try {
      articles = await fetchPubmedArticles(pmids)
    } catch {
      result.failed_patch += batch.length
      continue
    }
    const byPmid = new Map(articles.map((a) => [a.pmid, a]))

    for (const { row, pmid } of batch) {
      const article = byPmid.get(pmid)
      if (!article) { result.failed_patch += 1; continue }
      try {
        const patch = buildBackfillPatch(article, row)
        // 항상 PMID 도 채워줌 — 이게 핵심
        patch.PMID = { rich_text: [{ text: { content: pmid } }] }
        await notionRequest(`/pages/${row.pageId}`, {
          method: "PATCH",
          body: JSON.stringify({ properties: patch }),
        })
        result.patched += 1
        for (const key of Object.keys(patch)) {
          if (key in fieldStats) fieldStats[key] += 1
        }
        if (patch.Type) {
          const t = (patch.Type as { select: { name: string } }).select.name
          typeBreakdown[t] = (typeBreakdown[t] ?? 0) + 1
        }
        await sleep(120)
      } catch {
        result.failed_patch += 1
      }
    }
    await sleep(400)
  }

  // 결과 메일 리포트
  const email = await sendDoiBackfillReport(result, fieldStats, typeBreakdown)
  result.emailed = email.sent
  if (email.reason) result.emailSkippedReason = email.reason
  return result
}

async function sendDoiBackfillReport(
  result: DoiBackfillResult,
  fieldStats: Record<string, number>,
  typeBreakdown: Record<string, number>,
): Promise<{ sent: boolean; reason?: string }> {
  const user = process.env.JOURNAL_ALERT_SMTP_USER
  const pass = process.env.JOURNAL_ALERT_SMTP_PASS
  const host = process.env.JOURNAL_ALERT_SMTP_HOST ?? "smtp.gmail.com"
  const port = Number(process.env.JOURNAL_ALERT_SMTP_PORT ?? "587")
  const to = process.env.JOURNAL_ALERT_RECIPIENT ?? user
  const cc = process.env.JOURNAL_ALERT_CC?.trim() || undefined
  if (!user || !pass || !to) return { sent: false, reason: "email_not_configured" }

  const today = new Date().toISOString().slice(0, 10)
  const subject = `[Journal Alert] DOI Backfill 완료 — ${result.patched}건 패치 (PMID 복구)`
  const cell = (v: string | number) =>
    `<td style="padding:6px 10px;border-bottom:1px solid #2a2a2a;">${v}</td>`
  const fieldRows = Object.entries(fieldStats)
    .map(([f, c]) => `<tr>${cell(f)}${cell(`<span style="color:#fafafa;">${c}</span>건`)}</tr>`).join("")
  const typeRows = Object.entries(typeBreakdown).sort((a, b) => b[1] - a[1])
    .map(([t, c]) => `<tr>${cell(t)}${cell(`<span style="color:#fafafa;">${c}</span>건`)}</tr>`).join("")
  const html = `<!doctype html><html><body style="background:#09090b;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:680px;margin:0 auto;padding:24px;">
  <h1 style="margin:0 0 8px;">🔧 Journal DOI Backfill 완료</h1>
  <p style="margin:0 0 16px;color:#a1a1aa;">${today}</p>
  <h3 style="color:#fafafa;border-bottom:1px solid #333;padding-bottom:6px;margin-top:24px;">전체</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <tr>${cell("DOI 있고 PMID 없던 row")}${cell(`<span style="color:#fafafa;">${result.has_doi}</span>건`)}</tr>
    <tr>${cell("DOI→PMID 매핑 성공")}${cell(`<span style="color:#34d399;">${result.pmid_resolved}</span>건`)}</tr>
    <tr>${cell("PMID lookup 실패")}${cell(`<span style="color:${result.failed_pmid_lookup > 0 ? "#f87171" : "#a1a1aa"};">${result.failed_pmid_lookup}</span>건`)}</tr>
    <tr>${cell("패치 성공")}${cell(`<span style="color:#34d399;">${result.patched}</span>건`)}</tr>
    <tr>${cell("패치 실패")}${cell(`<span style="color:${result.failed_patch > 0 ? "#f87171" : "#a1a1aa"};">${result.failed_patch}</span>건`)}</tr>
  </table>
  <h3 style="color:#fafafa;border-bottom:1px solid #333;padding-bottom:6px;margin-top:24px;">필드별 채워진 row 수</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">${fieldRows}</table>
  ${Object.keys(typeBreakdown).length > 0 ? `
  <h3 style="color:#fafafa;border-bottom:1px solid #333;padding-bottom:6px;margin-top:24px;">Type 분포</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">${typeRows}</table>` : ""}
</div></body></html>`
  try {
    const transporter = nodemailer.createTransport({
      host, port, secure: port === 465, auth: { user, pass },
    })
    await transporter.sendMail({ from: user, to, cc, subject, html })
    return { sent: true }
  } catch (e) {
    return { sent: false, reason: `smtp_error: ${e instanceof Error ? e.message : "unknown"}` }
  }
}

function buildBackfillPatch(article: PubmedArticle, row: ExistingRow): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (!row.hasAbstract && article.abstract) {
    patch.Abstract = { rich_text: [{ text: { content: article.abstract.slice(0, 1900) } }] }
  }
  if (!row.hasKeywords) {
    const keywordOpts = toMultiSelectOptions(article.keywords)
    if (keywordOpts.length > 0) patch.Keywords = { multi_select: keywordOpts }
  }
  if (!row.hasAffiliations && article.affiliations) {
    patch.Affiliations = { rich_text: [{ text: { content: article.affiliations } }] }
  }
  if (!row.hasVol && article.volume) {
    patch.Vol = { rich_text: [{ text: { content: article.volume.slice(0, 100) } }] }
  }
  if (!row.hasIssue && article.issue) {
    patch.Issue = { rich_text: [{ text: { content: article.issue.slice(0, 100) } }] }
  }
  if (!row.hasCategory) {
    const derived = toMultiSelectOptions(deriveCategories(article))
    if (derived.length > 0) patch.Category = { multi_select: derived }
  }
  if (!row.hasType) {
    const mapped = mapNotionType(article.pubTypes)
    // 기존이 빈 값이거나 하드코딩 "Clinical Study" 였고, 새로 매핑한 타입이 더 구체적이면 교체.
    if (mapped !== "Clinical Study" || row.currentType === "") {
      patch.Type = { select: { name: mapped } }
    }
  }
  return patch
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

async function sendBackfillReport(
  result: BackfillResult,
  fieldStats: Record<string, number>,
  typeBreakdown: Record<string, number>,
): Promise<{ sent: boolean; reason?: string }> {
  const user = process.env.JOURNAL_ALERT_SMTP_USER
  const pass = process.env.JOURNAL_ALERT_SMTP_PASS
  const host = process.env.JOURNAL_ALERT_SMTP_HOST ?? "smtp.gmail.com"
  const port = Number(process.env.JOURNAL_ALERT_SMTP_PORT ?? "587")
  const to = process.env.JOURNAL_ALERT_RECIPIENT ?? user
  const cc = process.env.JOURNAL_ALERT_CC?.trim() || undefined
  if (!user || !pass || !to) return { sent: false, reason: "email_not_configured" }

  const today = new Date().toISOString().slice(0, 10)
  const subject = `[Journal Alert] Backfill 완료 — ${result.patched}건 패치`

  const cell = (v: string | number) =>
    `<td style="padding:6px 10px;border-bottom:1px solid #2a2a2a;">${v}</td>`
  const fieldRows = Object.entries(fieldStats)
    .map(([field, count]) => `<tr>${cell(field)}${cell(`<span style="color:#fafafa;">${count}</span>건`)}</tr>`)
    .join("")
  const typeRows = Object.entries(typeBreakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `<tr>${cell(type)}${cell(`<span style="color:#fafafa;">${count}</span>건`)}</tr>`)
    .join("")

  const html = `<!doctype html><html><body style="background:#09090b;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:680px;margin:0 auto;padding:24px;">
  <h1 style="margin:0 0 8px;">🔧 Journal Backfill 완료</h1>
  <p style="margin:0 0 16px;color:#a1a1aa;">${today}</p>

  <h3 style="color:#fafafa;border-bottom:1px solid #333;padding-bottom:6px;margin-top:24px;">전체</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    ${cell("스캔한 row")}${cell(`<span style="color:#fafafa;">${result.scanned}</span>건`)}</tr>
    <tr>${cell("패치 성공")}${cell(`<span style="color:#34d399;">${result.patched}</span>건`)}</tr>
    <tr>${cell("이미 풀(스킵)")}${cell(`<span style="color:#a1a1aa;">${result.skipped_full}</span>건`)}</tr>
    <tr>${cell("PMID 없음(스킵)")}${cell(`<span style="color:#a1a1aa;">${result.skipped_no_pmid}</span>건`)}</tr>
    <tr>${cell("실패")}${cell(`<span style="color:${result.failed > 0 ? "#f87171" : "#a1a1aa"};">${result.failed}</span>건`)}</tr>
  </table>

  <h3 style="color:#fafafa;border-bottom:1px solid #333;padding-bottom:6px;margin-top:24px;">필드별 채워진 row 수</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">${fieldRows}</table>

  ${Object.keys(typeBreakdown).length > 0 ? `
  <h3 style="color:#fafafa;border-bottom:1px solid #333;padding-bottom:6px;margin-top:24px;">Type 재분류 분포 (Clinical Study 떡칠 → 구체 타입)</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">${typeRows}</table>
  ` : ""}
</div></body></html>`

  try {
    const transporter = nodemailer.createTransport({
      host, port, secure: port === 465, auth: { user, pass },
    })
    await transporter.sendMail({ from: user, to, cc, subject, html })
    return { sent: true }
  } catch (e) {
    return { sent: false, reason: `smtp_error: ${e instanceof Error ? e.message : "unknown"}` }
  }
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

export interface RunOptions {
  /** false 면 이메일을 보내지 않고 Notion 만 채움 — 백필 용도. */
  sendEmail?: boolean
}

export async function runJournalAlertPipeline(days: number, options: RunOptions = {}): Promise<JournalAlertRunResult> {
  // Kill switch — 중복 cron 의심될 때 Vercel env 에 JOURNAL_ALERT_PAUSED=true 설정하면 즉시 no-op.
  // 이미 다른 곳에서 alert 발송되고 있다고 의심될 때 일시정지용.
  if ((process.env.JOURNAL_ALERT_PAUSED ?? "").trim().toLowerCase() === "true") {
    return {
      fetched: 0,
      inserted: 0,
      skipped: 0,
      emailed: false,
      emailSkippedReason: "paused_by_env_flag",
      existingKeysCount: 0,
    }
  }
  const shouldSendEmail = options.sendEmail !== false
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
  if (insertedWithIds.length > 0 && shouldSendEmail) {
    emailResult = await sendEmailAlert(insertedWithIds)
  } else if (insertedWithIds.length > 0 && !shouldSendEmail) {
    // 백필 모드 — 메일 안 보내되, 이미 받은 셈 치도록 Alerted 마크해서 다음 정상 alert 가 중복 전송하지 않도록 함.
    await markArticlesAsAlerted(insertedWithIds.map(({ pageId }) => pageId))
    emailResult = { sent: false, reason: "backfill_no_email", shownCount: 0 }
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
