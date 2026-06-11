import path from "node:path"
import os from "node:os"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { AgentEvent } from "./types"
import {
  appendTaskProjection,
  buildTaskBoardFromEvents,
  deriveTaskSnapshotsFromEvents,
  getTaskGroupId,
  listPersistedTaskSnapshots,
  resetTaskStoreForTests,
} from "./taskStore"

function makeEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    ts: overrides.ts ?? new Date().toISOString(),
    taskId: overrides.taskId,
    parentEventId: overrides.parentEventId,
    agent: overrides.agent ?? "dakota",
    role: overrides.role ?? "router",
    kind: overrides.kind ?? "received",
    status: overrides.status ?? "pending",
    channel: overrides.channel ?? "telegram",
    summary: overrides.summary ?? "테스트 요청",
    requiresApproval: overrides.requiresApproval ?? false,
    approvalState: overrides.approvalState ?? "none",
    artifactType: overrides.artifactType,
    artifactRef: overrides.artifactRef,
  }
}

describe("taskStore projection", () => {
  const originalDbPath = process.env.ORCHESTRATOR_TASK_DB_FILE

  beforeEach(() => {
    process.env.ORCHESTRATOR_TASK_DB_FILE = path.join(os.tmpdir(), `orchestrator-task-store-${crypto.randomUUID()}.sqlite`)
    resetTaskStoreForTests()
  })

  afterEach(() => {
    if (originalDbPath === undefined) {
      delete process.env.ORCHESTRATOR_TASK_DB_FILE
    } else {
      process.env.ORCHESTRATOR_TASK_DB_FILE = originalDbPath
    }
    resetTaskStoreForTests()
  })

  it("groups mirror events using parentEventId when explicit taskId is absent", () => {
    const reported = makeEvent({
      id: "report-1",
      agent: "warren",
      role: "specialist",
      kind: "reported",
      status: "completed",
      summary: "워렌 보고 완료",
      ts: "2026-06-10T10:00:00.000Z",
    })
    const dakotaSummary = makeEvent({
      id: "summary-1",
      agent: "dakota",
      role: "router",
      kind: "summarized",
      status: "completed",
      summary: "Dakota 요약",
      parentEventId: "report-1",
      ts: "2026-06-10T10:00:01.000Z",
    })

    expect(getTaskGroupId(reported)).toBe("report-1")
    expect(getTaskGroupId(dakotaSummary)).toBe("report-1")

    const snapshots = deriveTaskSnapshotsFromEvents([reported, dakotaSummary])
    expect(snapshots).toHaveLength(1)

    const grouped = snapshots.find((task) => task.taskId === "report-1")
    expect(grouped?.latestSummary).toBe("Dakota 요약")
  })

  it("projects a task lifecycle into sqlite and classifies active vs completed", () => {
    const taskId = "telegram-1-100"
    appendTaskProjection(makeEvent({
      id: "evt-1",
      taskId,
      agent: "dakota",
      role: "user",
      kind: "received",
      status: "pending",
      summary: "오늘 일정 보여줘",
      ts: "2026-06-10T10:10:00.000Z",
    }))
    appendTaskProjection(makeEvent({
      id: "evt-2",
      taskId,
      agent: "dakota",
      role: "router",
      kind: "analyzed",
      status: "in_progress",
      summary: "일정 조회 시작",
      ts: "2026-06-10T10:10:01.000Z",
    }))

    let persisted = listPersistedTaskSnapshots()
    expect(persisted).toHaveLength(1)
    expect(persisted[0]?.status).toBe("in_progress")
    expect(persisted[0]?.eventCount).toBe(2)

    appendTaskProjection(makeEvent({
      id: "evt-3",
      taskId,
      agent: "dakota",
      role: "specialist",
      kind: "reported",
      status: "completed",
      summary: "다가오는 일정 3개",
      artifactType: "calendar",
      ts: "2026-06-10T10:10:02.000Z",
    }))

    persisted = listPersistedTaskSnapshots()
    expect(persisted[0]?.status).toBe("completed")
    expect(persisted[0]?.resultSummary).toBe("다가오는 일정 3개")
    expect(persisted[0]?.artifactType).toBe("calendar")

    const board = buildTaskBoardFromEvents([
      makeEvent({ id: "evt-a", taskId: "task-a", kind: "received", status: "pending", summary: "A" }),
      makeEvent({ id: "evt-b", taskId: "task-b", kind: "failed", status: "blocked", summary: "B 막힘" }),
      makeEvent({ id: "evt-c", taskId: "task-c", kind: "reported", status: "completed", summary: "C 완료" }),
    ])

    expect(board.active.map((task) => task.taskId)).toContain("task-a")
    expect(board.blocked.map((task) => task.taskId)).toContain("task-b")
    expect(board.recentCompleted.map((task) => task.taskId)).toContain("task-c")
  })
})
