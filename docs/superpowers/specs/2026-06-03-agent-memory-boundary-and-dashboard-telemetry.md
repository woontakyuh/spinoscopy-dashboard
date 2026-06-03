# Agent Memory Boundary & Dashboard Telemetry Spec

## Decision
For the Dakota executive system, keep **one Hermes front-door runtime** but separate memory into:
1. shared core context
2. persona-local memory
3. activity/event telemetry

Do **not** rely on one shared Hermes memory store for all specialist working memory. That will blur persona boundaries.

## Why
The user wants:
- Dakota as chief of staff
- specialist agents (Elon, Brian, Lo, Warren, Andrej)
- shared strategic context
- separated agent memories
- dashboard visibility into who did what

This means memory architecture and execution telemetry must be designed separately.

## Recommended architecture
### Shared core context
Store only stable cross-agent facts here:
- user preferences
- family constraints
- strategic priorities
- stable org chart / routing rules

Possible stores:
- Hermes memory
- Obsidian strategy notes

### Persona-local memory
Each agent gets its own namespace.
Examples:
- `elon/*`
- `brian/*`
- `lo/*`
- `warren/*`
- `andrej/*`

Possible stores:
- agent-specific notes in Obsidian
- agent-specific Notion DBs or tables
- later, separate Hermes profiles if stronger isolation is required

### Activity telemetry
Separate from long-term memory.
Use app-side storage to record execution events.

## Data model proposal
```ts
export type AgentId = "dakota" | "elon" | "brian" | "lo" | "warren" | "andrej"

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

export interface AgentEvent {
  id: string
  ts: string
  taskId?: string
  parentEventId?: string
  agent: AgentId
  role: "user" | "router" | "specialist" | "executor"
  kind: EventKind
  status: EventStatus
  channel: "telegram" | "dashboard" | "cron" | "local"
  summary: string
  requiresApproval: boolean
  approvalState: ApprovalState
  artifactType?: "email" | "notion" | "calendar" | "code" | "note" | "report"
  artifactRef?: string
}
```

## UI proposal
### 1. Dakota executive feed
A reverse-chronological feed showing:
- what Dakota received
- whom Dakota delegated to
- what came back
- what is waiting for approval
- what completed or failed

### 2. Agent lane board
Six lanes:
- Dakota
- Elon
- Brian
- Lo
- Warren
- Andrej

Each lane shows recent events, pending work, and blocked items.

### 3. Approval queue
Dedicated panel for items needing user confirmation:
- email send
- Notion write
- calendar change
- investment action
- code push/deploy

### 4. Memory boundary panel
A simple health view:
- shared-core notes count
- persona-local note counts by agent
- latest updated timestamps
- possible cross-agent contamination flags later

## Implementation notes
- Notion is good for operational state, not ideal for high-frequency telemetry.
- For telemetry, prefer app-side storage first.
- Minimal v1 can even start with a JSON/SQLite-backed internal log, then move later.
- Every Dakota delegation should create an event.
- Every specialist return should create an event.
- Every approval gate transition should create an event.

## Suggested v1 build order
1. define `AgentEvent` types
2. add event logger utility
3. record Dakota delegate/report events
4. create executive feed UI
5. create approval queue UI
6. add lane board by agent

## Product principle
This dashboard should not be a generic chat transcript viewer.
It should visualize the executive operating system:
- delegation
- specialist work
- approvals
- outcomes
- bottlenecks
