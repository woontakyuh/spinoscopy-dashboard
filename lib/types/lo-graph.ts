export type BjjRuleset = "common" | "gi" | "nogi"
export type TechniqueStatus = "hypothesis" | "testing" | "adopted" | "shelved"
export type EvidenceOutcome = "success" | "failure" | "observation"

export interface MarkdownSourceFile {
  /** POSIX path relative to the BJJ repository root. */
  path: string
  content: string
}

export interface SourceCitation {
  /** Stable citation ID suitable for API responses. */
  id: string
  path: string
  line: number
  endLine?: number
  excerpt?: string
}

export interface GraphDiagnostic {
  severity: "error" | "warning"
  code: string
  message: string
  citation: SourceCitation
}

export type FrontmatterScalar = string
export type FrontmatterObject = Record<string, FrontmatterScalar>
export type FrontmatterValue = FrontmatterScalar | FrontmatterScalar[] | FrontmatterObject[]

export interface ParsedFrontmatter {
  data: Record<string, FrontmatterValue>
  body: string
  /** The one-based source line on which the markdown body starts. */
  bodyLine: number
  fieldLines: Record<string, number[]>
  diagnostics: GraphDiagnostic[]
}

export interface PositionTransition {
  id: string
  fromId: string
  toId: string
  label: string
  kind: string
  status?: TechniqueStatus
  condition?: string
  citation: SourceCitation
}

export interface BjjPosition {
  id: string
  name: string
  nameKr: string
  layer: string
  family?: string
  parentId?: string
  perspective?: string
  ruleset: BjjRuleset
  curriculumLessons: number[]
  source: SourceCitation
}

export interface TechniqueBranch {
  id: string
  techniqueId: string
  targetId: string
  condition?: string
  label?: string
  citation: SourceCitation
}

export interface BjjTechnique {
  id: string
  name: string
  fromId: string
  toIds: string[]
  branches: TechniqueBranch[]
  ruleset: BjjRuleset
  status: TechniqueStatus
  sourceId: string
  firstLearned?: string
  instructor?: string
  isCounter: boolean
  source: SourceCitation
}

export interface BjjEvidence {
  id: string
  kind: "technique" | "log"
  date?: string
  outcome: EvidenceOutcome
  text: string
  subjectIds: string[]
  playerIds: string[]
  citation: SourceCitation
}

export interface BjjGameFlowBranch {
  id: string
  text: string
  positionIds: string[]
  techniqueIds: string[]
  citation: SourceCitation
}

export interface BjjGameFlow {
  id: string
  name: string
  ruleset: BjjRuleset
  status: TechniqueStatus
  branches: BjjGameFlowBranch[]
  citation: SourceCitation
}

/** Explicit self-ratings, when present in BJJ/ratings/*.md. */
export interface BjjPlayerRating {
  id: string
  name: string
  score: number
  scale: number
  dimension?: string
  citation: SourceCitation
}

export type BjjGraphEdge =
  | { type: "transition"; value: PositionTransition }
  | { type: "technique"; value: BjjTechnique }

export interface GraphNeighborhood {
  position: BjjPosition
  incoming: BjjGraphEdge[]
  outgoing: BjjGraphEdge[]
  relatedPositions: BjjPosition[]
  techniques: BjjTechnique[]
  citations: SourceCitation[]
}

export interface BjjGraphReadModel {
  positions: BjjPosition[]
  techniques: BjjTechnique[]
  transitions: PositionTransition[]
  branches: TechniqueBranch[]
  evidence: BjjEvidence[]
  gameFlows: BjjGameFlow[]
  playerRatings: BjjPlayerRating[]
  citations: SourceCitation[]
  diagnostics: GraphDiagnostic[]
}
