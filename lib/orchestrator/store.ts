import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import type { AgentEvent, AgentEventInput, AgentId } from "./types"
import { ORCHESTRATOR_AGENT_IDS } from "./types"

interface EventStore {
  events: AgentEvent[]
}

const DEFAULT_STORE_DIR = path.join(process.cwd(), ".superpowers", "orchestrator")
const STORE_DIR = process.env.ORCHESTRATOR_STORE_DIR?.trim() || DEFAULT_STORE_DIR
const STORE_FILE = process.env.ORCHESTRATOR_STORE_FILE?.trim() || path.join(STORE_DIR, "events.json")
const MAX_EVENTS = 500

function normalizeEventStatus(status: unknown): AgentEvent["status"] {
  if (status === "pending" || status === "in_progress" || status === "completed" || status === "blocked" || status === "cancelled") {
    return status
  }
  if (status === "active") return "in_progress"
  if (status === "done") return "completed"
  return "completed"
}

function normalizeStoredEvent(event: Partial<AgentEvent>): AgentEvent | null {
  if (!event || typeof event !== "object") return null
  if (!event.id || !event.ts || !event.agent || !event.role || !event.kind || !event.channel || !event.summary) {
    return null
  }

  return {
    id: String(event.id),
    ts: String(event.ts),
    taskId: event.taskId ? String(event.taskId) : undefined,
    parentEventId: event.parentEventId ? String(event.parentEventId) : undefined,
    agent: event.agent,
    role: event.role,
    kind: event.kind,
    status: normalizeEventStatus(event.status),
    channel: event.channel,
    summary: String(event.summary),
    requiresApproval: Boolean(event.requiresApproval),
    approvalState: event.approvalState ?? "none",
    artifactType: event.artifactType,
    artifactRef: event.artifactRef ? String(event.artifactRef) : undefined,
  }
}

async function ensureStore(): Promise<boolean> {
  try {
    await mkdir(path.dirname(STORE_FILE), { recursive: true })
    try {
      await readFile(STORE_FILE, "utf-8")
    } catch {
      await writeFile(STORE_FILE, JSON.stringify({ events: [] }, null, 2), "utf-8")
    }
    return true
  } catch {
    return false
  }
}

async function readStore(): Promise<EventStore> {
  const storeReady = await ensureStore()
  if (!storeReady) {
    return { events: [] }
  }

  try {
    const raw = await readFile(STORE_FILE, "utf-8")
    const parsed = JSON.parse(raw) as Partial<EventStore>
    const events = Array.isArray(parsed.events)
      ? parsed.events.map((event) => normalizeStoredEvent(event)).filter((event): event is AgentEvent => Boolean(event))
      : []
    return { events }
  } catch {
    return { events: [] }
  }
}

async function writeStore(store: EventStore): Promise<void> {
  const storeReady = await ensureStore()
  if (!storeReady) return
  try {
    await writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf-8")
  } catch {
    // Read-only deployments (e.g. serverless preview/demo hosts) should still
    // serve a 200 telemetry response with an empty feed instead of failing hard.
  }
}

export async function appendAgentEvent(input: AgentEventInput): Promise<AgentEvent> {
  const store = await readStore()
  const event: AgentEvent = {
    id: input.id ?? randomUUID(),
    ts: input.ts ?? new Date().toISOString(),
    ...input,
  }

  store.events.unshift(event)
  if (store.events.length > MAX_EVENTS) {
    store.events = store.events.slice(0, MAX_EVENTS)
  }
  await writeStore(store)
  return event
}

export interface ListAgentEventsOptions {
  agent?: AgentId
  status?: AgentEvent["status"]
  requiresApproval?: boolean
  limit?: number
}

export async function listAgentEvents(opts: ListAgentEventsOptions = {}): Promise<AgentEvent[]> {
  const store = await readStore()
  let events = store.events.slice().sort((a, b) => b.ts.localeCompare(a.ts))

  if (opts.agent) {
    events = events.filter((event) => event.agent === opts.agent)
  }
  if (opts.status) {
    events = events.filter((event) => event.status === opts.status)
  }
  if (typeof opts.requiresApproval === "boolean") {
    events = events.filter((event) => event.requiresApproval === opts.requiresApproval)
  }

  return events.slice(0, opts.limit ?? 50)
}

export async function getApprovalQueue(limit = 20): Promise<AgentEvent[]> {
  const events = await listAgentEvents({ requiresApproval: true, limit: MAX_EVENTS })
  return events
    .filter((event) => event.approvalState === "proposed" || event.status === "pending")
    .slice(0, limit)
}

export async function getAgentLanes(limitPerLane = 4): Promise<Record<AgentId, AgentEvent[]>> {
  const events = await listAgentEvents({ limit: MAX_EVENTS })
  return ORCHESTRATOR_AGENT_IDS.reduce<Record<AgentId, AgentEvent[]>>((acc, agent) => {
    acc[agent] = events.filter((event) => event.agent === agent).slice(0, limitPerLane)
    return acc
  }, {} as Record<AgentId, AgentEvent[]>)
}

export function getEventStorePath(): string {
  return STORE_FILE
}
