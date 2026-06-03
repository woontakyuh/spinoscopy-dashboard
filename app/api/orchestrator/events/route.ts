import { NextRequest, NextResponse } from "next/server"
import { appendAgentEvent, listAgentEvents } from "@/lib/orchestrator/store"
import { isAgentId, type AgentEventInput } from "@/lib/orchestrator/types"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const agentParam = searchParams.get("agent")
    const limitParam = searchParams.get("limit")
    const requiresApprovalParam = searchParams.get("requiresApproval")
    const statusParam = searchParams.get("status")

    const agent = agentParam && isAgentId(agentParam) ? agentParam : undefined
    const limit = limitParam ? Number.parseInt(limitParam, 10) : 50
    const requiresApproval = requiresApprovalParam === null
      ? undefined
      : requiresApprovalParam === "true"

    const events = await listAgentEvents({
      agent,
      limit: Number.isFinite(limit) ? limit : 50,
      requiresApproval,
      status: statusParam as AgentEventInput["status"] | undefined,
    })

    return NextResponse.json({ events })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<AgentEventInput>

    if (!body.agent || !isAgentId(body.agent)) {
      return NextResponse.json({ error: "invalid agent" }, { status: 400 })
    }
    if (!body.kind || !body.role || !body.status || !body.channel || !body.summary) {
      return NextResponse.json({ error: "missing required fields" }, { status: 400 })
    }

    const event = await appendAgentEvent({
      agent: body.agent,
      role: body.role,
      kind: body.kind,
      status: body.status,
      channel: body.channel,
      summary: body.summary,
      requiresApproval: Boolean(body.requiresApproval),
      approvalState: body.approvalState ?? "none",
      artifactType: body.artifactType,
      artifactRef: body.artifactRef,
      parentEventId: body.parentEventId,
      taskId: body.taskId,
    })

    return NextResponse.json({ ok: true, event })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 }
    )
  }
}
