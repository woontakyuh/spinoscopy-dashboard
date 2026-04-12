export type EditorialRole = "Editor" | "Reviewer"

export type EditorialStatus =
  | "Received"
  | "Editorial Review"
  | "Desk Reject"
  | "Reviewer Assignment"
  | "Under Peer Review"
  | "Reviews Collected"
  | "Decision Made"
  | "Revision Received"
  | "Complete"

export type Recommendation =
  | "Accept"
  | "Minor Revision"
  | "Major Revision"
  | "Reject"
  | "Peer Review"
  | "Desk Reject"

export type FinalDecision = "Accept" | "Reject" | "Desk Reject" | "Pending"

export type ManuscriptType =
  | "Original Article"
  | "Review"
  | "Case Report"
  | "Letter"
  | "Technical Note"
  | "Other"

export interface EditorialItem {
  page_id: string
  url: string
  name: string
  role: EditorialRole
  journal: string
  manuscript_id: string
  manuscript_type: ManuscriptType
  status: EditorialStatus
  first_recommendation: Recommendation | null
  last_recommendation: Recommendation | null
  final_decision: FinalDecision | null
  date_received: string | null
  date_submitted: string | null
  deadline: string | null
  decision_date: string | null
  review_round: number | null
  reviewers: string
  notes: string
}
