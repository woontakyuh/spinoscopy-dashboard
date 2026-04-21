export type EditorialRole = "Editor" | "Reviewer"

export type EditorialStatus =
  | "Received"
  | "Under Review"
  | "Under Revision"
  | "Accepted"
  | "Rejected"

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

export type Journal =
  | "Neurospine"
  | "JMISST"
  | "KJNT"
  | "Scientific Reports"
  | "PLOS ONE"
  | "World Neurosurgery"
  | "Other"

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
