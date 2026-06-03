import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import type { AgentEvent, AgentEventInput, AgentId } from "./types"
import { ORCHESTRATOR_AGENT_IDS } from "./types"

interface EventStore {
  events: AgentEvent[]
}

const STORE_DIR = path.join(process.cwd(), ".superpowers", "orchestrator")
const STORE_FILE = path.join(STORE_DIR, "events.json")
const MAX_EVENTS = 500

async function ensureStore(): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true })
  try {
    await readFile(STORE_FILE, "utf-8")
  } catch {
    await writeFile(STORE_FILE, JSON.stringify({ events: [] }, null, 2), "utf-8")
  }
}

async function readStore(): Promise<EventStore> {
  await ensureStore()
  try {
    const raw = await readFile(STORE_FILE, "utf-8")
    const parsed = JSON.parse(raw) as Partial<EventStore>
    return { events: Array.isArray(parsed.events) ? parsed.events : [] }
  } catch {
    return { events: [] }
  }
}

async function writeStore(store: EventStore): Promise<void> {
  await ensureStore()
  await writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf-8")
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
