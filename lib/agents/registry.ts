import { ORCHESTRATOR_AGENT_IDS, type AgentId } from "@/lib/orchestrator/types"
export type { AgentId } from "@/lib/orchestrator/types"

export type AgentCapability = "calendar" | "notion" | "patient" | "research" | "web" | "strategy" | "training" | "ai-workflow"

export interface AgentDefinition {
  id: AgentId
  label: string
  model: "claude-sonnet-5"
  capabilities: readonly AgentCapability[]
}

/**
 * Declarative agent contract. Prompt and tool builders remain in the existing
 * chat runtime for now; this registry is the single source of truth for
 * identity, model tier, and routing capability.
 */
export const AGENT_REGISTRY: Record<AgentId, AgentDefinition> = {
  dakota: { id: "dakota", label: "Dakota", model: "claude-sonnet-5", capabilities: ["calendar", "notion", "strategy"] },
  elon: { id: "elon", label: "Elon", model: "claude-sonnet-5", capabilities: ["patient", "web"] },
  brian: { id: "brian", label: "Brian", model: "claude-sonnet-5", capabilities: ["research", "web"] },
  andrej: { id: "andrej", label: "Andrej", model: "claude-sonnet-5", capabilities: ["ai-workflow", "web"] },
  warren: { id: "warren", label: "Warren", model: "claude-sonnet-5", capabilities: ["strategy"] },
  lo: { id: "lo", label: "Lo", model: "claude-sonnet-5", capabilities: ["training", "web"] },
}

export function isRegisteredAgentId(value: unknown): value is AgentId {
  return typeof value === "string" && ORCHESTRATOR_AGENT_IDS.includes(value as AgentId)
}

export function getAgentDefinition(agentId: AgentId): AgentDefinition {
  return AGENT_REGISTRY[agentId]
}
