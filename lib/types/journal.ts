export type InterestLevel = "🔴 필독" | "🟡 관심" | "⚪ 참고"

export interface JournalArticle {
  page_id: string
  url: string
  title: string
  authors: string
  journal_name: string
  pub_date: string | null
  doi_url: string | null
  abstract: string
  summary: string
  interest: InterestLevel
  read: boolean
  alerted: boolean
  pmid: string | null
  keywords: string[]
  categories: string[]
  pub_type: string
  volume: string
  issue: string
  affiliations: string
}

export interface JournalFilter {
  interest?: InterestLevel | "all"
  journal?: string | "all"
  category?: string | "all"
  read?: boolean | "all"
  search?: string              // 단일 키워드 — Title + Abstract OR 매칭
  queries?: string[]           // 다중 키워드 (유의어·약자) — 각각 Title + Abstract OR 매칭
  sort?: "date_desc" | "date_asc"
  cursor?: string
}

export interface JournalQueryResult {
  articles: JournalArticle[]
  has_more: boolean
  next_cursor: string | null
  total_count?: number
}

export interface JournalStats {
  total: number
  unread: number
  by_interest: Record<InterestLevel, number>
  by_journal: Record<string, number>
  by_category: Record<string, number>
  recent_week: number
}

/** 크로스필터 대시보드용 경량 아이템 */
export interface ArticleMeta {
  id: string
  title: string
  journal: string
  interest: InterestLevel
  read: boolean
  pub_date: string | null
  pub_type: string
  country: string | null
  topics: string[]
  categories: string[]
  doi_url: string | null
}

export interface DashboardData {
  articles: ArticleMeta[]
  total: number
  unread: number
  recent_week: number
}
