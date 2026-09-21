export type EditorialRole = "Editor" | "Reviewer"

export type EditorialStatus =
  | "Received"
  | "1st Review"
  | "1st Review Done"
  | "1st Revision"
  | "2nd Review"
  | "2nd Review Done"
  | "2nd Revision"
  | "3rd Review"
  | "3rd Review Done"
  | "3rd Revision"
  | "Accepted"
  | "Rejected"
  | "Declined"   // 리뷰 요청 자체를 거절한 건
  // 레거시 호환 (옛 row 에 남아 있을 수 있음)
  | "Under Review"
  | "Under Revision"

export type Recommendation =
  | "Accept"
  | "Minor Revision"
  | "Major Revision"
  | "Reject"
  | "Peer Review"
  | "Desk Reject"
  | "Pending"

export type ManuscriptType =
  | "Original Article"
  | "Review"
  | "Case Report"
  | "Letter"
  | "Technical Note"
  | "Commentary"
  | "Editorial"
  | "Other"

export type Methodology =
  | "Insurance Claims Big Data"
  | "Single-Center Retrospective"
  | "Multicenter Retrospective"
  | "Prospective Cohort"
  | "RCT"
  | "Propensity Score Matching"
  | "Systematic Review"
  | "Meta-Analysis"
  | "Case Series"
  | "Case Report"
  | "AI/Machine Learning"
  | "Deep Learning"
  | "Biomechanical Study"
  | "Cadaveric Study"
  | "Survey Study"
  | "Technical Note"
  | "Narrative Review"
  | "Cross-Sectional Study"
  | "Registry Study"

/**
 * Notion "Editor-Reviewer" DB 의 Journal select 옵션과 정확히 같아야 한다.
 * 값 배열에서 타입을 끌어내 어긋남을 테스트로 잡는다 (lib/editorial/journal.test.ts).
 * 대소문자도 DB 그대로다 — "BMC surgery" 는 소문자 s.
 */
export const JOURNAL_OPTIONS = [
  "Neurospine",
  "JMISST",
  "KJNT",
  "Scientific Reports",
  "PLOS ONE",
  "World Neurosurgery",
  "BMC surgery",
  "BMC Cancer",
  "JSOR",
  "Book Review",
] as const

export type Journal = (typeof JOURNAL_OPTIONS)[number]

export interface EditorialItem {
  page_id: string
  url: string
  name: string
  role: EditorialRole
  journal: Journal | ""
  manuscript_id: string
  manuscript_type: ManuscriptType
  methodology: Methodology[]
  status: EditorialStatus
  recommendation: Recommendation | null
  date_received: string | null
  date_submitted: string | null
  deadline: string | null
  review_round: number | null
  reviewers: string
  notes: string
}
