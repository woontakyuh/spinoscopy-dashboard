import { mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import type { AgentEvent, ApprovalState, TaskBoard, TaskSnapshot } from "./types"

const require = createRequire(import.meta.url)
const DEFAULT_TASK_DB_FILE = path.join(process.cwd(), ".superpowers", "orchestrator", "tasks.sqlite")

interface StatementLike {
  run(...params: unknown[]): unknown
  all(...params: unknown[]): unknown[]
}

interface DatabaseLike {
  exec(sql: string): void
  prepare(sql: string): StatementLike
  close(): void
}

type DatabaseCtor = new (filename?: string) => DatabaseLike

type SqlTaskRow = {
  task_id: string
  channel: AgentEvent["channel"]
  requested_at: string
  updated_at: string
  requested_agent: AgentEvent["agent"]
  current_agent: AgentEvent["agent"]
  title: string
  requested_summary: string
  latest_summary: string
  result_summary: string | null
  latest_kind: AgentEvent["kind"]
  status: AgentEvent["status"]
  requires_approval: number
  approval_state: ApprovalState
  artifact_type: AgentEvent["artifactType"] | null
  artifact_ref: string | null
  event_count: number
  blocked: number
}

type SqlTaskEventRow = {
  id: string
  task_id: string
  ts: string
  parent_event_id: string | null
  agent: AgentEvent["agent"]
  role: AgentEvent["role"]
  kind: AgentEvent["kind"]
  status: AgentEvent["status"]
  channel: AgentEvent["channel"]
  summary: string
  requires_approval: number
  approval_state: ApprovalState
  artifact_type: AgentEvent["artifactType"] | null
  artifact_ref: string | null
}

let cachedDb: DatabaseLike | null = null
let cachedDbPath: string | null = null

function getTaskDbFile(): string {
  return process.env.ORCHESTRATOR_TASK_DB_FILE?.trim() || DEFAULT_TASK_DB_FILE
}

function ensureTaskSchema(db: DatabaseLike) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_events (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      ts TEXT NOT NULL,
      parent_event_id TEXT,
      agent TEXT NOT NULL,
      role TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      channel TEXT NOT NULL,
      summary TEXT NOT NULL,
      requires_approval INTEGER NOT NULL DEFAULT 0,
      approval_state TEXT NOT NULL DEFAULT 'none',
      artifact_type TEXT,
      artifact_ref TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_task_events_task_id_ts ON task_events(task_id, ts DESC);

    CREATE TABLE IF NOT EXISTS tasks (
      task_id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      requested_agent TEXT NOT NULL,
      current_agent TEXT NOT NULL,
      title TEXT NOT NULL,
      requested_summary TEXT NOT NULL,
      latest_summary TEXT NOT NULL,
      result_summary TEXT,
      latest_kind TEXT NOT NULL,
      status TEXT NOT NULL,
      requires_approval INTEGER NOT NULL DEFAULT 0,
      approval_state TEXT NOT NULL DEFAULT 'none',
      artifact_type TEXT,
      artifact_ref TEXT,
      event_count INTEGER NOT NULL DEFAULT 0,
      blocked INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, updated_at DESC);
  `)
}

function getDb(): DatabaseLike | null {
  const dbFile = getTaskDbFile()
  if (cachedDb && cachedDbPath === dbFile) return cachedDb

  try {
    if (dbFile !== ":memory:") {
      mkdirSync(path.dirname(dbFile), { recursive: true })
    }
    const sqlite = require("node:sqlite") as { DatabaseSync?: DatabaseCtor }
    if (!sqlite.DatabaseSync) return null
    const db = new sqlite.DatabaseSync(dbFile)
    ensureTaskSchema(db)
    cachedDb = db
    cachedDbPath = dbFile
    return db
  } catch {
    return null
  }
}

function compact(text: string, max = 140): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max)
}

export function getTaskGroupId(event: AgentEvent): string {
  const explicit = event.taskId?.trim()
  if (explicit) return explicit

  const parent = event.parentEventId?.trim()
  if (parent) return parent

  return event.id
}

function mapRowToEvent(row: SqlTaskEventRow): AgentEvent {
  return {
    id: row.id,
    taskId: row.task_id,
    ts: row.ts,
    parentEventId: row.parent_event_id ?? undefined,
    agent: row.agent,
    role: row.role,
    kind: row.kind,
    status: row.status,
    channel: row.channel,
    summary: row.summary,
    requiresApproval: Boolean(row.requires_approval),
    approvalState: row.approval_state,
    artifactType: row.artifact_type ?? undefined,
    artifactRef: row.artifact_ref ?? undefined,
  }
}

function mapRowToTask(row: SqlTaskRow): TaskSnapshot {
  return {
    taskId: row.task_id,
    channel: row.channel,
    requestedAt: row.requested_at,
    updatedAt: row.updated_at,
    agent: row.requested_agent,
    currentAgent: row.current_agent,
    title: row.title,
    requestedSummary: row.requested_summary,
    latestSummary: row.latest_summary,
    resultSummary: row.result_summary,
    latestKind: row.latest_kind,
    status: row.status,
    requiresApproval: Boolean(row.requires_approval),
    approvalState: row.approval_state,
    artifactType: row.artifact_type ?? undefined,
    artifactRef: row.artifact_ref ?? undefined,
    eventCount: row.event_count,
    blocked: Boolean(row.blocked),
  }
}

export function deriveTaskSnapshot(taskId: string, events: AgentEvent[]): TaskSnapshot {
  const ordered = [...events].sort((a, b) => a.ts.localeCompare(b.ts))
  const first = ordered[0]
  const latest = ordered.at(-1)

  if (!first || !latest) {
    throw new Error(`cannot derive task snapshot without events: ${taskId}`)
  }

  const latestApproval = [...ordered].reverse().find((event) => event.requiresApproval || event.approvalState !== "none")
  const latestResult = [...ordered].reverse().find((event) => {
    return event.kind === "reported" || event.kind === "executed" || event.kind === "approved" || event.kind === "failed" || event.kind === "blocked"
  })

  const waitingApproval = Boolean(
    latestApproval && (latestApproval.approvalState === "proposed" || latestApproval.status === "pending")
  )
  const blocked = latest.status === "blocked" || latest.kind === "blocked" || latest.kind === "failed"

  return {
    taskId,
    channel: first.channel,
    requestedAt: first.ts,
    updatedAt: latest.ts,
    agent: first.agent,
    currentAgent: latest.agent,
    title: compact(first.summary, 88),
    requestedSummary: first.summary,
    latestSummary: latest.summary,
    resultSummary: latestResult?.summary ?? (latest.status === "completed" ? latest.summary : null),
    latestKind: latest.kind,
    status: waitingApproval ? "pending" : latest.status,
    requiresApproval: waitingApproval,
    approvalState: latestApproval?.approvalState ?? latest.approvalState,
    artifactType: latest.artifactType ?? latestResult?.artifactType,
    artifactRef: latest.artifactRef ?? latestResult?.artifactRef,
    eventCount: ordered.length,
    blocked,
  }
}

export function deriveTaskSnapshotsFromEvents(events: AgentEvent[]): TaskSnapshot[] {
  const groups = new Map<string, AgentEvent[]>()
  for (const event of events) {
    const taskId = getTaskGroupId(event)
    const current = groups.get(taskId) ?? []
    current.push({ ...event, taskId })
    groups.set(taskId, current)
  }

  return [...groups.entries()]
    .map(([taskId, grouped]) => deriveTaskSnapshot(taskId, grouped))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function classifyTaskBoard(snapshots: TaskSnapshot[]): TaskBoard {
  const ordered = [...snapshots].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return {
    active: ordered.filter((task) => !task.blocked && !task.requiresApproval && (task.status === "pending" || task.status === "in_progress")).slice(0, 8),
    blocked: ordered.filter((task) => task.blocked).slice(0, 8),
    awaitingApproval: ordered.filter((task) => task.requiresApproval).slice(0, 8),
    recentCompleted: ordered.filter((task) => !task.blocked && !task.requiresApproval && task.status === "completed").slice(0, 8),
  }
}

export function buildTaskBoardFromEvents(events: AgentEvent[]): TaskBoard {
  return classifyTaskBoard(deriveTaskSnapshotsFromEvents(events))
}

function upsertTaskRow(db: DatabaseLike, task: TaskSnapshot) {
  db.prepare(`
    INSERT INTO tasks (
      task_id, channel, requested_at, updated_at, requested_agent, current_agent,
      title, requested_summary, latest_summary, result_summary, latest_kind, status,
      requires_approval, approval_state, artifact_type, artifact_ref, event_count, blocked
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(task_id) DO UPDATE SET
      channel = excluded.channel,
      requested_at = excluded.requested_at,
      updated_at = excluded.updated_at,
      requested_agent = excluded.requested_agent,
      current_agent = excluded.current_agent,
      title = excluded.title,
      requested_summary = excluded.requested_summary,
      latest_summary = excluded.latest_summary,
      result_summary = excluded.result_summary,
      latest_kind = excluded.latest_kind,
      status = excluded.status,
      requires_approval = excluded.requires_approval,
      approval_state = excluded.approval_state,
      artifact_type = excluded.artifact_type,
      artifact_ref = excluded.artifact_ref,
      event_count = excluded.event_count,
      blocked = excluded.blocked
  `).run(
    task.taskId,
    task.channel,
    task.requestedAt,
    task.updatedAt,
    task.agent,
    task.currentAgent,
    task.title,
    task.requestedSummary,
    task.latestSummary,
    task.resultSummary,
    task.latestKind,
    task.status,
    task.requiresApproval ? 1 : 0,
    task.approvalState,
    task.artifactType ?? null,
    task.artifactRef ?? null,
    task.eventCount,
    task.blocked ? 1 : 0,
  )
}

export function appendTaskProjection(event: AgentEvent): TaskSnapshot | null {
  const db = getDb()
  if (!db) return null

  const taskId = getTaskGroupId(event)

  db.prepare(`
    INSERT OR IGNORE INTO task_events (
      id, task_id, ts, parent_event_id, agent, role, kind, status, channel,
      summary, requires_approval, approval_state, artifact_type, artifact_ref
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id,
    taskId,
    event.ts,
    event.parentEventId ?? null,
    event.agent,
    event.role,
    event.kind,
    event.status,
    event.channel,
    event.summary,
    event.requiresApproval ? 1 : 0,
    event.approvalState,
    event.artifactType ?? null,
    event.artifactRef ?? null,
  )

  const rows = db.prepare(`SELECT * FROM task_events WHERE task_id = ? ORDER BY ts ASC`).all(taskId) as SqlTaskEventRow[]
  const events = rows.map(mapRowToEvent)
  const task = deriveTaskSnapshot(taskId, events)
  upsertTaskRow(db, task)
  return task
}

export function listPersistedTaskSnapshots(limit = 50): TaskSnapshot[] {
  const db = getDb()
  if (!db) return []

  const rows = db.prepare(`SELECT * FROM tasks ORDER BY updated_at DESC LIMIT ?`).all(limit) as SqlTaskRow[]
  return rows.map(mapRowToTask)
}

function mergeTaskSnapshots(primary: TaskSnapshot[], secondary: TaskSnapshot[]): TaskSnapshot[] {
  const merged = new Map<string, TaskSnapshot>()

  for (const task of [...secondary, ...primary]) {
    const current = merged.get(task.taskId)
    if (!current || task.updatedAt >= current.updatedAt) {
      merged.set(task.taskId, task)
    }
  }

  return [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function buildTaskBoard(eventsFallback: AgentEvent[]): TaskBoard {
  const persisted = listPersistedTaskSnapshots(200)
  const derived = deriveTaskSnapshotsFromEvents(eventsFallback)
  return classifyTaskBoard(mergeTaskSnapshots(persisted, derived))
}

export function getTaskStorePath(): string {
  return getTaskDbFile()
}

export function resetTaskStoreForTests() {
  if (cachedDb) {
    try {
      cachedDb.close()
    } catch {
      // ignore close failures in tests
    }
  }
  cachedDb = null
  cachedDbPath = null
}
