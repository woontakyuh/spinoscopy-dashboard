import { NextResponse } from "next/server"
import { getAgentLanes, getApprovalQueue, listAgentEvents } from "@/lib/orchestrator/store"
import { buildTaskBoard } from "@/lib/orchestrator/taskStore"
import { ORCHESTRATOR_AGENT_IDS, type AgentId } from "@/lib/orchestrator/types"
import { listMemories, type MemoryRow, isSharedCoreCategory } from "@/lib/notion/dakotaMemoryV2"

function normalizeAgentSource(source: string): AgentId | null {
  const lowered = source.trim().toLowerCase()
  for (const agent of ORCHESTRATOR_AGENT_IDS) {
    if (lowered === agent || lowered.startsWith(`agent:${agent}:`)) return agent
  }
  return null
}

function formatMemoryBoundary(rows: MemoryRow[]) {
  const sharedCoreRows = rows.filter((row) => isSharedCoreCategory(String(row.category)) || row.source.toLowerCase().startsWith("shared-core:"))
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
    const [events, approvals, lanes] = await Promise.all([
      listAgentEvents({ limit: 100 }),
      getApprovalQueue(12),
      getAgentLanes(4),
    ])
    const feed = events.slice(0, 30)
    const tasks = buildTaskBoard(events)

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
      tasks,
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
