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
  search?: string
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
