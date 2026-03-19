import { notionRequest } from "./client"
import type {
  JournalArticle,
  JournalFilter,
  JournalQueryResult,
  JournalStats,
  InterestLevel,
  ArticleMeta,
  DashboardData,
} from "../types/journal"
import { extractCountry, classifyTopics, normalizeArticleType } from "../scholar/country"

interface NotionPage {
  id: string
  url: string
  properties: Record<string, NotionProperty>
}

interface NotionProperty {
  type: string
  title?: Array<{ plain_text?: string }>
  rich_text?: Array<{ plain_text?: string }>
  date?: { start: string; end: string | null } | null
  select?: { name: string } | null
  multi_select?: Array<{ name: string }>
  url?: string | null
  checkbox?: boolean
}

interface NotionQueryResponse {
  results: NotionPage[]
  has_more: boolean
  next_cursor: string | null
}

function getText(prop: NotionProperty | undefined): string {
  if (!prop) return ""
  if (prop.type === "title")
    return (prop.title ?? []).map((t) => t.plain_text ?? "").join("").trim()
  if (prop.type === "rich_text")
    return (prop.rich_text ?? []).map((t) => t.plain_text ?? "").join("").trim()
  return ""
}

function getMultiSelect(prop: NotionProperty | undefined): string[] {
  return (prop?.multi_select ?? []).map((o) => o.name)
}

function toArticle(page: NotionPage): JournalArticle {
  const p = page.properties
  return {
    page_id: page.id,
    url: page.url,
    title: getText(p.Title),
    authors: getText(p.Author),
    journal_name: p["Journal Name"]?.select?.name ?? "",
    pub_date: p["Publication Date"]?.date?.start ?? null,
    doi_url: p.DOI?.url ?? null,
    abstract: getText(p.Abstract),
    summary: getText(p.Summary),
    interest: (p["관심도"]?.select?.name as InterestLevel) ?? "⚪ 참고",
    read: p["읽음"]?.checkbox ?? false,
    alerted: p["Alerted"]?.checkbox ?? false,
    pmid: getText(p.PMID) || null,
    keywords: getMultiSelect(p.Keywords),
    categories: getMultiSelect(p.Category),
    pub_type: p.Type?.select?.name ?? "",
    volume: getText(p.Vol),
    issue: getText(p.Issue),
    affiliations: getText(p.Affiliations),
  }
}

const JOURNAL_DB_ID = process.env.NOTION_JOURNAL_DB_ID ?? ""

function buildFilter(filter: JournalFilter) {
  const conditions: Record<string, unknown>[] = []

  if (filter.interest && filter.interest !== "all") {
    conditions.push({
      property: "관심도",
      select: { equals: filter.interest },
    })
  }

  if (filter.journal && filter.journal !== "all") {
    conditions.push({
      property: "Journal Name",
      select: { equals: filter.journal },
    })
  }

  if (filter.category && filter.category !== "all") {
    conditions.push({
      property: "Category",
      multi_select: { contains: filter.category },
    })
  }

  if (filter.read !== undefined && filter.read !== "all") {
    conditions.push({
      property: "읽음",
      checkbox: { equals: filter.read },
    })
  }

  if (filter.search) {
    conditions.push({
      property: "Title",
      title: { contains: filter.search },
    })
  }

  if (conditions.length === 0) return undefined
  if (conditions.length === 1) return conditions[0]
  return { and: conditions }
}

export async function queryArticles(
  filter: JournalFilter = {}
): Promise<JournalQueryResult> {
  const body: Record<string, unknown> = {
    page_size: 100,
    sorts: [
      {
        property: "Publication Date",
        direction: filter.sort === "date_asc" ? "ascending" : "descending",
      },
    ],
  }

  const notionFilter = buildFilter(filter)
  if (notionFilter) body.filter = notionFilter
  if (filter.cursor) body.start_cursor = filter.cursor

  const response = await notionRequest<NotionQueryResponse>(
    `/databases/${JOURNAL_DB_ID}/query`,
    { method: "POST", body: JSON.stringify(body) }
  )

  return {
    articles: response.results.map(toArticle),
    has_more: response.has_more,
    next_cursor: response.next_cursor,
  }
}

export async function getArticle(pageId: string): Promise<JournalArticle> {
  const page = await notionRequest<NotionPage>(`/pages/${pageId}`)
  return toArticle(page)
}

export async function toggleRead(
  pageId: string,
  read: boolean
): Promise<void> {
  await notionRequest(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: { "읽음": { checkbox: read } },
    }),
  })
}

export async function updateInterest(
  pageId: string,
  interest: InterestLevel
): Promise<void> {
  await notionRequest(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: { "관심도": { select: { name: interest } } },
    }),
  })
}

export async function getJournalStats(): Promise<JournalStats> {
  const stats: JournalStats = {
    total: 0,
    unread: 0,
    by_interest: { "🔴 필독": 0, "🟡 관심": 0, "⚪ 참고": 0 },
    by_journal: {},
    by_category: {},
    recent_week: 0,
  }

  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
  const weekStr = oneWeekAgo.toISOString().slice(0, 10)

  let cursor: string | null = null
  let hasMore = true

  while (hasMore) {
    const body: Record<string, unknown> = { page_size: 100 }
    if (cursor) body.start_cursor = cursor

    const response = await notionRequest<NotionQueryResponse>(
      `/databases/${JOURNAL_DB_ID}/query`,
      { method: "POST", body: JSON.stringify(body) }
    )

    for (const page of response.results) {
      const article = toArticle(page)
      stats.total++
      if (!article.read) stats.unread++
      if (article.interest in stats.by_interest) {
        stats.by_interest[article.interest]++
      }
      if (article.journal_name) {
        stats.by_journal[article.journal_name] =
          (stats.by_journal[article.journal_name] ?? 0) + 1
      }
      for (const cat of article.categories) {
        stats.by_category[cat] = (stats.by_category[cat] ?? 0) + 1
      }
      if (article.pub_date && article.pub_date >= weekStr) {
        stats.recent_week++
      }
    }

    hasMore = response.has_more
    cursor = response.next_cursor
  }

  return stats
}

/** 크로스필터 대시보드용 전체 논문 경량 메타데이터 */
export async function getDashboardData(): Promise<DashboardData> {
  const articles: ArticleMeta[] = []
  let cursor: string | null = null
  let hasMore = true
  let unread = 0
  let recentWeek = 0

  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
  const weekStr = oneWeekAgo.toISOString().slice(0, 10)

  while (hasMore) {
    const body: Record<string, unknown> = { page_size: 100 }
    if (cursor) body.start_cursor = cursor

    const response = await notionRequest<NotionQueryResponse>(
      `/databases/${JOURNAL_DB_ID}/query`,
      { method: "POST", body: JSON.stringify(body) }
    )

    for (const page of response.results) {
      const a = toArticle(page)
      if (!a.read) unread++
      if (a.pub_date && a.pub_date >= weekStr) recentWeek++

      articles.push({
        id: a.page_id,
        title: a.title,
        journal: a.journal_name,
        interest: a.interest,
        read: a.read,
        pub_date: a.pub_date,
        pub_type: normalizeArticleType(a.pub_type),
        country: extractCountry(a.affiliations),
        topics: classifyTopics(a.title, a.abstract, a.keywords),
        categories: a.categories,
        doi_url: a.doi_url,
      })
    }

    hasMore = response.has_more
    cursor = response.next_cursor
  }

  return { articles, total: articles.length, unread, recent_week: recentWeek }
}
