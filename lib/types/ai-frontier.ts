// AI Frontier 읽기 모델 (Notion 2개 DB: AI Frontier Episodes / AI Frontier Concepts).
// 읽기 전용이며 Notion 쓰기 타입은 정의하지 않는다.

/** Concept이 참조하는 에피소드. multi_select 문자열이라 관계가 끊길 수 있다. */
export interface AiFrontierEpisodeRef {
  /** 정규화된 참조 문자열. 예: "EP12" */
  ref: string
  /** Episodes index에서 실제 에피소드를 찾았는지 (Todo 2에서 해석) */
  available: boolean
  /** 매칭된 Notion page id. 미해석/orphan이면 null */
  pageId: string | null
}

export interface AiFrontierEpisode {
  id: string
  /** Notion `Name` (title) */
  name: string
  /** Notion `Episode` */
  episodeNumber: number | null
  /** Notion `Status` */
  status: string | null
  /** Notion `Published` (ISO date start) */
  published: string | null
  /** Notion `Recorded` (ISO date start) */
  recorded: string | null
  /** Notion `Reviewed` (checkbox). 값이 없으면 false */
  reviewed: boolean
  /** Notion `Topics` */
  topics: string[]
  /** Notion `Models` */
  models: string[]
  /** Notion `People` */
  people: string[]
  /** Notion `YouTube` */
  youtube: string | null
  /** Notion `Transcript Source` */
  transcriptSource: string | null
  /** Notion `Duration` (표시용 원문 보존) */
  duration: string | null
  /** Notion `한줄요약` */
  summary: string | null
  /** Notion `Key Terms` */
  keyTerms: string[]
}

export interface AiFrontierConcept {
  id: string
  /** Notion `Term` (title) */
  term: string
  /** Notion `Korean` */
  korean: string | null
  /** Notion `Category` */
  category: string | null
  /**
   * Notion `Verified` 라벨. 예: "전사 기반".
   * 사실 검증 여부가 아니라 출처 라벨이므로 boolean으로 바꾸지 않는다.
   */
  verified: string | null
  /** Notion `One-line Explanation` */
  oneLine: string | null
  /** Notion `Intuition` */
  intuition: string | null
  /** Notion `Why It Matters` */
  whyItMatters: string | null
  /** Notion `Source` */
  source: string | null
  /** Notion `Episodes` (multi_select, relation 아님) */
  episodes: AiFrontierEpisodeRef[]
}

export interface AiFrontierBlock {
  id: string
  type: string
  text: string
}

export interface AiFrontierEpisodeDetail extends AiFrontierEpisode {
  blocks: AiFrontierBlock[]
  truncated: boolean
}

export type AiFrontierStatus = "ok" | "partial" | "unavailable"
export type AiFrontierSourceStatus = "ok" | "unavailable"

export interface AiFrontierSourceStatuses {
  episodes: AiFrontierSourceStatus
  concepts: AiFrontierSourceStatus
}

export interface AiFrontierIndex {
  status: AiFrontierStatus
  sources: AiFrontierSourceStatuses
  episodes: AiFrontierEpisode[]
  concepts: AiFrontierConcept[]
  episodeIndex: Record<string, string>
}

/** Notion API에서 사용하는 AI Frontier 속성의 타입 안전한 부분집합. */
export interface NotionAiFrontierText {
  plain_text?: string
}

export interface NotionAiFrontierProperty {
  type: string
  title?: NotionAiFrontierText[]
  rich_text?: NotionAiFrontierText[]
  select?: { name?: string } | null
  multi_select?: Array<{ name?: string }>
  number?: number | null
  checkbox?: boolean
  date?: { start?: string | null } | null
  url?: string | null
}

export interface NotionAiFrontierPage {
  id: string
  properties: Record<string, NotionAiFrontierProperty>
}

export interface NotionAiFrontierQueryResponse {
  results: NotionAiFrontierPage[]
  next_cursor: string | null
  has_more: boolean
}

export type NotionAiFrontierTextBlockType =
  | "paragraph"
  | "heading_1"
  | "heading_2"
  | "heading_3"
  | "bulleted_list_item"
  | "numbered_list_item"
  | "quote"

export interface NotionAiFrontierBlockContent {
  rich_text?: NotionAiFrontierText[]
}

export type NotionAiFrontierBlock = {
  id: string
  type: string
} & Partial<Record<NotionAiFrontierTextBlockType, NotionAiFrontierBlockContent>>

export interface NotionAiFrontierBlocksResponse {
  results: NotionAiFrontierBlock[]
  next_cursor: string | null
  has_more: boolean
}
