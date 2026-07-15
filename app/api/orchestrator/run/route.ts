import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { appendAgentEvent } from "@/lib/orchestrator/store"
import { isRegisteredAgentId, type AgentId } from "@/lib/agents/registry"

const KEYWORD_ROUTES: Array<{ agent: AgentId; pattern: RegExp }> = [
  { agent: "brian", pattern: /논문|연구|저널|review|manuscript|registry|ksor/i },
  { agent: "andrej", pattern: /ai|llm|agent|workflow|자동화|dashboard|mcp|hermes/i },
  { agent: "warren", pattern: /사업|투자|자산|매출|수익|시장|bitcoin|비트코인/i },
  { agent: "lo", pattern: /bjj|주짓수|훈련|회복|컨디션|수련/i },
  { agent: "elon", pattern: /환자|수술|진료|케이스|임상|prom/i },
]

function chooseAgents(prompt: string, requested?: unknown): AgentId[] {
  if (Array.isArray(requested)) {
    const explicit = requested.filter(isRegisteredAgentId)
    if (explicit.length > 0) return [...new Set(explicit)]
  }
  const matched = KEYWORD_ROUTES.filter((route) => route.pattern.test(prompt)).map((route) => route.agent)
  // A Command Center request with no domain signal remains Dakota work; a
  // multi-domain request fans out to the matching specialist lanes.
  return matched.length > 0 ? [...new Set(matched)] : ["dakota"]
}

async function invokeAgent(req: NextRequest, agent: AgentId, prompt: string, taskId: string) {
  await appendAgentEvent({
    taskId, agent, role: "router", kind: "delegated", status: "in_progress", channel: "dashboard",
    summary: `${agent}에게 분석을 위임했습니다.`, requiresApproval: false, approvalState: "none",
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 90_000)
  try {
    const response = await fetch(new URL("/api/ai/chat", req.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(req.headers.get("cookie") ? { cookie: req.headers.get("cookie")! } : {}),
      },
      signal: controller.signal,
      body: JSON.stringify({ agentId: agent, messages: [{ role: "user", content: prompt }] }),
    })
    const text = (await response.text()).trim()
    if (!response.ok) throw new Error(text || `agent request failed (${response.status})`)
    await appendAgentEvent({
      taskId, agent, role: "specialist", kind: "reported", status: "completed", channel: "dashboard",
      summary: text.slice(0, 220) || `${agent} 분석 완료`, requiresApproval: false, approvalState: "none", artifactType: "report",
    })
    return { agent, ok: true, text }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown agent failure"
    await appendAgentEvent({
      taskId, agent, role: "specialist", kind: "failed", status: "blocked", channel: "dashboard",
      summary: message.slice(0, 220), requiresApproval: false, approvalState: "none",
    })
    return { agent, ok: false, text: message }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Real server-side fan-out for the Command Center. This deliberately returns
 * labelled specialist reports rather than pretending Dakota performed the
 * analysis itself. A durable queue is the next phase; this route establishes
 * truthful concurrent execution and backend lifecycle telemetry first.
 */
export async function POST(req: NextRequest) {
  let body: { prompt?: unknown; agents?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 })
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : ""
  if (!prompt) return NextResponse.json({ error: "prompt is required" }, { status: 400 })

  const taskId = randomUUID()
  const agents = chooseAgents(prompt, body.agents)
  await appendAgentEvent({
    taskId, agent: "dakota", role: "user", kind: "received", status: "in_progress", channel: "dashboard",
    summary: prompt.slice(0, 220), requiresApproval: false, approvalState: "none",
  })

  const reports = await Promise.all(agents.map((agent) => invokeAgent(req, agent, prompt, taskId)))
  await appendAgentEvent({
    taskId, agent: "dakota", role: "router", kind: "summarized", status: "completed", channel: "dashboard",
    summary: `${reports.filter((report) => report.ok).length}/${reports.length} specialist report(s) returned.`,
    requiresApproval: false, approvalState: "none", artifactType: "report",
  })
  return NextResponse.json({ taskId, agents, reports })
}
