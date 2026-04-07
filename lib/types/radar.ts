export type FeedTier = "ai-company" | "thought-leader" | "newsletter"

export type FeedCadence = "6h" | "24h" | "weekly" | "twice-weekly"

export type FeedCategory = "model-release" | "tool" | "research" | "policy" | "medical-ai" | "opinion"

export type FeedSource =
  | "tldr-ai"
  | "the-rundown-ai"
  | "the-batch"
  | "import-ai"
  | "latent-space"
  | "raschka"
  | "arxiv"
  | "hf-daily-papers"
  | "nature-digital-medicine"
  | "radiology-ai"
  | "msr-health"
  | "x-akhaliq"
  | "moduletter"
  | "openai-blog"
  | "deepmind-blog"
  | "google-ai-blog"
  | "karpathy-blog"
  | "dwarkesh-podcast"
  | "anthropic-engineering"
  | "anthropic-research"
  | "karpathy-youtube"
  | "lex-fridman-ai"

export interface FeedItem {
  id: string
  title: string
  url: string
  source: FeedSource
  sourceLabel: string
  tier: FeedTier
  cadence: FeedCadence
  author: string | null
  date: string          // ISO date string
  points: number | null // HN points, null for RSS
  commentUrl: string | null
  summary: string | null // Korean 1-line summary (populated client-side)
  categories: FeedCategory[]
  importanceScore: 1 | 2 | 3 | 4 | 5
  notes: string | null
}

export interface FeedResponse {
  items: FeedItem[]
  fetchedAt: string
}

export interface SummarizeRequest {
  title: string
  url: string
  source: FeedSource
  description?: string  // pre-scraped summary/description for context
}

export interface SummarizeResponse {
  summary: string
  categories: FeedCategory[]
  importanceScore: 1 | 2 | 3 | 4 | 5
  notes: string
}

export interface RadarSourceConfig {
  id: FeedSource
  label: string
  tier: FeedTier
  cadence: FeedCadence
  intervalHours: number
  mode: "rss" | "api" | "html" | "manual" | "youtube" | "rss+filter" | "atom"
  endpoint: string
  active: boolean
}
