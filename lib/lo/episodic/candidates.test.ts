import { describe, expect, it, vi } from "vitest"

import type { LoConversationTurn } from "./store"
import { createLoMemoryCandidateQueue } from "./candidates"

function turn(overrides: Partial<LoConversationTurn> = {}): LoConversationTurn {
  return {
    turnId: "turn-1",
    sessionId: "session-1",
    surface: "dashboard",
    contextKey: "dashboard:conversation-1",
    externalTurnId: "message-1",
    userText: "기억해줘: 나는 왼쪽 니쉴드에서 언더훅을 먼저 잡는 걸 선호해",
    assistantText: "기억 후보로 올려둘게.",
    createdAt: "2026-08-05T06:00:00.000Z",
    ...overrides,
  }
}

describe("Lo memory candidate queue", () => {
  it("queues an explicit durable user fact without promoting it", () => {
    const queue = createLoMemoryCandidateQueue({ filePath: ":memory:" })

    const candidate = queue.considerTurn(turn())

    expect(candidate).toMatchObject({
      status: "pending",
      content: "나는 왼쪽 니쉴드에서 언더훅을 먼저 잡는 걸 선호해",
      category: "preference",
      sourceReference: "sqlite:lo-turn:turn-1",
    })
    expect(queue.list({ status: "pending" })).toEqual([candidate])
    queue.close()
  })

  it("ignores transient text, assistant text, and explicit secrets", () => {
    const queue = createLoMemoryCandidateQueue({ filePath: ":memory:" })

    expect(queue.considerTurn(turn({
      turnId: "turn-2",
      userText: "오늘 스파링 어땠어?",
      assistantText: "기억해줘: 사용자는 하프가드를 좋아해",
    }))).toBeNull()
    expect(queue.considerTurn(turn({
      turnId: "turn-3",
      userText: "기억해줘: API token은 secret-value야",
    }))).toBeNull()
    expect(queue.list({ status: "pending" })).toEqual([])
    queue.close()
  })

  it("deduplicates retries and identical pending facts across turns", () => {
    const queue = createLoMemoryCandidateQueue({ filePath: ":memory:" })
    const first = queue.considerTurn(turn())

    expect(queue.considerTurn(turn())).toEqual(first)
    expect(queue.considerTurn(turn({
      turnId: "turn-4",
      externalTurnId: "message-4",
    }))).toEqual(first)
    expect(queue.list({ status: "pending" })).toHaveLength(1)
    queue.close()
  })

  it("promotes an approved candidate once with deterministic chat provenance", async () => {
    const queue = createLoMemoryCandidateQueue({ filePath: ":memory:" })
    const candidate = queue.considerTurn(turn())
    const promote = vi.fn().mockResolvedValue({ pageId: "notion-memory-1" })

    const approved = await queue.approve({
      candidateId: candidate?.candidateId ?? "",
      promote,
    })
    const repeated = await queue.approve({
      candidateId: candidate?.candidateId ?? "",
      promote,
    })

    expect(promote).toHaveBeenCalledTimes(1)
    expect(promote).toHaveBeenCalledWith({
      name: "나는 왼쪽 니쉴드에서 언더훅을 먼저 잡는 걸 선호해",
      content: "나는 왼쪽 니쉴드에서 언더훅을 먼저 잡는 걸 선호해",
      category: "preference",
      importance: 3,
      source: {
        kind: "chat",
        reference: "sqlite:lo-turn:turn-1",
        capturedAt: "2026-08-05T06:00:00.000Z",
      },
    })
    expect(approved).toMatchObject({ status: "approved", notionPageId: "notion-memory-1" })
    expect(repeated).toEqual(approved)
    queue.close()
  })

  it("leaves a candidate pending when Notion promotion fails", async () => {
    const queue = createLoMemoryCandidateQueue({ filePath: ":memory:" })
    const candidate = queue.considerTurn(turn())

    await expect(queue.approve({
      candidateId: candidate?.candidateId ?? "",
      promote: vi.fn().mockRejectedValue(new Error("Notion unavailable")),
    })).rejects.toThrow("Notion unavailable")

    expect(queue.list({ status: "pending" })).toEqual([candidate])
    queue.close()
  })

  it("rejects a pending candidate without calling Notion", () => {
    const queue = createLoMemoryCandidateQueue({ filePath: ":memory:" })
    const candidate = queue.considerTurn(turn())

    const rejected = queue.reject(candidate?.candidateId ?? "")

    expect(rejected).toMatchObject({ status: "rejected", notionPageId: null })
    expect(queue.list({ status: "pending" })).toEqual([])
    queue.close()
  })
})
