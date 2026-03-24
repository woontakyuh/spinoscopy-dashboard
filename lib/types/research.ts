export type ResearchStatus = "WNS" | "Manuscript drafting" | "Editing" | "Submitted" | "Published" | "Hold"

export const RESEARCH_STATUSES: ResearchStatus[] = [
  "WNS",
  "Manuscript drafting",
  "Editing",
  "Submitted",
  "Published",
  "Hold",
]

export const STATUS_LABELS: Record<ResearchStatus, string> = {
  "WNS": "WNS",
  "Manuscript drafting": "Drafting",
  "Editing": "Editing",
  "Submitted": "Submitted",
  "Published": "Published",
  "Hold": "Hold",
}

export interface ResearchProject {
  page_id: string
  url: string
  title: string
  status: ResearchStatus
  first_author: string[]
  corresponding: string[]
  target_journal: string
  start_date: string | null
  publish_date: string | null
}

export interface ResearchCreateInput {
  title: string
  status: ResearchStatus
  firstAuthor: string[]
  corresponding: string[]
  targetJournal: string
  startDate: string | null
  publishDate: string | null
}

export interface ResearchUpdateInput {
  status?: ResearchStatus
  title?: string
  firstAuthor?: string[]
  corresponding?: string[]
  targetJournal?: string
  startDate?: string | null
  publishDate?: string | null
}
