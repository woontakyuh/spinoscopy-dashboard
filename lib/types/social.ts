export type SocialPlatform = "threads" | "x"

export type SocialLang = "ko" | "en"

export interface SocialItem {
  id: string // Notion page id (or postId fallback)
  platform: SocialPlatform
  account: string // choi.openai / karpathy
  lang: SocialLang
  text: string // 본문 전체
  url: string // 원글 permalink
  postedAt: string // ISO date string ("" if unknown)
  avatarUrl: string // 프로필 사진 URL ("" if none)
}

export interface SocialFeedResponse {
  items: SocialItem[]
  fetchedAt: string
}

export interface SocialSummarizeRequest {
  text: string
}

export interface SocialSummarizeResponse {
  summary: string
}
