import { NextRequest, NextResponse } from "next/server"
import { appendAgentEvent, listAgentEvents } from "@/lib/orchestrator/store"
import { isAgentId, type AgentEvent, type AgentEventInput, type AgentId } from "@/lib/orchestrator/types"

function formatAgentLabel(agent: AgentId): string {
  const labels: Record<AgentId, string> = {
    dakota: "Dakota",
    elon: "Elon",
    brian: "Brian",
    lo: "Lo",
    warren: "Warren",
    andrej: "Andrej",
  }
  return labels[agent]
}

function buildDakotaAwarenessEvent(event: AgentEvent): AgentEventInput | null {
  if (event.agent === "dakota") return null
  if (event.kind !== "received" && event.kind !== "reported") return null

  const agentLabel = formatAgentLabel(event.agent)
  const prefix = event.kind === "received"
    ? `직접 specialist 호출 감지 — ${agentLabel}가 요청을 받음`
    : `직접 specialist 보고 요약 — ${agentLabel} 응답 완료`

  return {
    agent: "dakota",
    role: "router",
    kind: "summarized",
    status: event.status,
    channel: event.channel,
    summary: `${prefix}: ${event.summary}`.slice(0, 220),
    requiresApproval: event.requiresApproval,
    approvalState: event.approvalState,
    artifactType: "note",
    artifactRef: event.id,
    parentEventId: event.id,
    taskId: event.taskId,
  }
}

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

    const dakotaAwarenessEvent = buildDakotaAwarenessEvent(event)
    if (dakotaAwarenessEvent) {
      await appendAgentEvent(dakotaAwarenessEvent)
    }

    return NextResponse.json({ ok: true, event, dakotaAwareness: Boolean(dakotaAwarenessEvent) })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 }
    )
  }
}
