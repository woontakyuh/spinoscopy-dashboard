import { NextResponse } from "next/server"
import { getAgentLanes, getApprovalQueue, listAgentEvents } from "@/lib/orchestrator/store"
import { ORCHESTRATOR_AGENT_IDS, type AgentId } from "@/lib/orchestrator/types"
import { listMemories, type MemoryRow } from "@/lib/notion/dakotaMemoryV2"

const SHARED_CORE_CATEGORIES = new Set(["profile", "preference", "person", "project", "rule"])

function normalizeAgentSource(source: string): AgentId | null {
  const lowered = source.trim().toLowerCase()
  return ORCHESTRATOR_AGENT_IDS.includes(lowered as AgentId) ? (lowered as AgentId) : null
}

function formatMemoryBoundary(rows: MemoryRow[]) {
  const sharedCoreRows = rows.filter((row) => SHARED_CORE_CATEGORIES.has(String(row.category)))
  const personaCounts = ORCHESTRATOR_AGENT_IDS.reduce<Record<AgentId, { count: number; latestUpdatedAt: string | null }>>((acc, agent) => {
    const scoped = rows.filter((row) => normalizeAgentSource(row.source) === agent)
    acc[agent] = {
      count: scoped.length,
      latestUpdatedAt: scoped[0]?.last_edited_time ?? null,
    }
    return acc
  }, {} as Record<AgentId, { count: number; latestUpdatedAt: string | null }>)

  return {
    sharedCoreCount: sharedCoreRows.length,
    sharedCoreLatestUpdatedAt: sharedCoreRows[0]?.last_edited_time ?? null,
    personaCounts,
    personaNamespaceReady: ORCHESTRATOR_AGENT_IDS.some((agent) => personaCounts[agent].count > 0),
  }
}

export async function GET() {
  try {
    const [feed, approvals, lanes] = await Promise.all([
      listAgentEvents({ limit: 30 }),
      getApprovalQueue(12),
      getAgentLanes(4),
    ])

    let memoryBoundary:
      | {
          sharedCoreCount: number
          sharedCoreLatestUpdatedAt: string | null
          personaCounts: Record<AgentId, { count: number; latestUpdatedAt: string | null }>
          personaNamespaceReady: boolean
        }
      | null = null
    let memoryError: string | null = null

    try {
      const rows = await listMemories({ status: "active", limit: 100 })
      memoryBoundary = formatMemoryBoundary(rows)
    } catch (error) {
      memoryError = error instanceof Error ? error.message : "memory unavailable"
    }

    return NextResponse.json({
      feed,
      approvals,
      lanes,
      memoryBoundary,
      memoryError,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 }
    )
  }
}
