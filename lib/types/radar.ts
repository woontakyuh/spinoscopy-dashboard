export type FeedSource = "hn" | "the-batch"

export interface FeedItem {
  id: string
  title: string
  url: string
  source: FeedSource
  sourceLabel: string
  author: string | null
  date: string          // ISO date string
  points: number | null // HN points, null for RSS
  commentUrl: string | null
  summary: string | null // Korean 1-line summary (populated client-side)
}

export interface FeedResponse {
  items: FeedItem[]
  fetchedAt: string
}

export interface SummarizeRequest {
  title: string
  url: string
}

export interface SummarizeResponse {
  summary: string
}
