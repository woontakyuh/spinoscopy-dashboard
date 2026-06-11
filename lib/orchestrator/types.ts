export const ORCHESTRATOR_AGENT_IDS = ["dakota", "elon", "brian", "lo", "warren", "andrej"] as const

export type AgentId = (typeof ORCHESTRATOR_AGENT_IDS)[number]

export type EventKind =
  | "received"
  | "delegated"
  | "analyzed"
  | "reported"
  | "proposed"
  | "approved"
  | "executed"
  | "blocked"
  | "failed"
  | "summarized"

export type ApprovalState = "none" | "proposed" | "approved" | "rejected"
export type EventStatus = "pending" | "in_progress" | "completed" | "blocked" | "cancelled"
export type EventChannel = "telegram" | "dashboard" | "cron" | "local"
export type EventRole = "user" | "router" | "specialist" | "executor"
export type ArtifactType = "email" | "notion" | "calendar" | "code" | "note" | "report"

export interface AgentEvent {
  id: string
  ts: string
  taskId?: string
  parentEventId?: string
  agent: AgentId
  role: EventRole
  kind: EventKind
  status: EventStatus
  channel: EventChannel
  summary: string
  requiresApproval: boolean
  approvalState: ApprovalState
  artifactType?: ArtifactType
  artifactRef?: string
}

export interface TaskSnapshot {
  taskId: string
  channel: EventChannel
  requestedAt: string
  updatedAt: string
  agent: AgentId
  currentAgent: AgentId
  title: string
  requestedSummary: string
  latestSummary: string
  resultSummary: string | null
  latestKind: EventKind
  status: EventStatus
  requiresApproval: boolean
  approvalState: ApprovalState
  artifactType?: ArtifactType
  artifactRef?: string
  eventCount: number
  blocked: boolean
}

export interface TaskBoard {
  active: TaskSnapshot[]
  blocked: TaskSnapshot[]
  awaitingApproval: TaskSnapshot[]
  recentCompleted: TaskSnapshot[]
}

export type AgentEventInput = Omit<AgentEvent, "id" | "ts"> & {
  id?: string
  ts?: string
}

export function isAgentId(value: string): value is AgentId {
  return ORCHESTRATOR_AGENT_IDS.includes(value as AgentId)
}
