export type ResearchStatus =
  | "Idea" | "Lit Review" | "Drafting" | "Editing" | "Submitted"
  | "Revision" | "2nd Review" | "Accepted" | "Published"
  | "Rejected" | "Hold"
  // 레거시 호환
  | "WNS" | "Manuscript drafting" | "\bManscript drafting"

export const RESEARCH_STATUSES: ResearchStatus[] = [
  "Idea",
  "Lit Review",
  "Drafting",
  "Editing",
  "Submitted",
  "Revision",
  "2nd Review",
  "Accepted",
  "Published",
  "Rejected",
  "Hold",
]

export const STATUS_LABELS: Record<string, string> = {
  "Idea": "Idea",
  "Lit Review": "Lit Review",
  "Drafting": "Drafting",
  "Editing": "Editing",
  "Submitted": "Submitted",
  "Revision": "Revision",
  "2nd Review": "2nd Review",
  "Accepted": "Accepted",
  "Published": "Published",
  "Rejected": "Rejected",
  "Hold": "Hold",
  // 레거시
  "WNS": "Lit Review",
  "Manuscript drafting": "Drafting",
  "\bManscript drafting": "Drafting",
}

export const KNOWN_JOURNALS = [
  "TSJ", "JNS spine", "Neurospine", "Sci Rep", "ONS", "JKNS",
  "Acta Neuro", "Turkish Neurosurg", "Engineering (MDPI)", "PLOS One",
  "JMISST", "KJS", "JMIR Med Inform", "Int J Pain", "KJNT", "IJSS", "JNA",
]

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
