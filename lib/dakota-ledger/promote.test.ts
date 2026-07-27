import { describe, expect, it, vi } from "vitest"
import { buildPrompt, effectiveOrigin, enforceRules, promoteDay } from "./promote"
import type { PromotedOperation, PromotedSession, PromotionResult } from "./promote"
import type { ClassifiedSession, DaySessions } from "./types"

function session(over: Partial<ClassifiedSession> = {}): ClassifiedSession {
  return {
    sessionKey: "s-1", channel: "telegram", startedAt: "2026-07-20T04:00:00.000Z",
    messageCount: 10, firstUserMessage: "정리해줘", lastAssistantMessage: "네",
    toolNames: [], origin: "지시", ...over,
  }
}

const DAY: DaySessions = {
  date: "2026-07-20",
  sessions: [session({ sessionKey: "s-1", origin: "지시" }), session({ sessionKey: "s-2", origin: "수행" })],
}

const EXISTING = [
  { page_id: "op-1", name: "AI 오픈채팅 signal intelligence", domain: "AI", status: "In Progress" },
] as never[]

describe("buildPrompt", () => {
  it("날짜·세션·기존 과제를 담는다", () => {
    const p = buildPrompt(DAY, EXISTING)
    expect(p).toContain("2026-07-20")
    expect(p).toContain("s-1")
    expect(p).toContain("AI 오픈채팅 signal intelligence")
    expect(p).toContain("op-1")
  })

  it("수행 세션이 신규 과제를 못 만든다는 규칙을 명시한다", () => {
    expect(buildPrompt(DAY, EXISTING)).toContain("수행")
  })
})

function promoted(over: Partial<PromotedSession> = {}): PromotedSession {
  return {
    sessionKey: "s-1", name: "a", summary: "", domain: "AI", tags: [],
    outcome: "완료", agent: "dakota", operationRef: null, originOverride: null, ...over,
  }
}

function newOp(ref: string): PromotedOperation {
  return {
    ref, name: "새 과제", domain: "AI", tags: [], type: "Execution",
    status: "In Progress", priority: "Medium", context: "", actionTaken: "",
    result: "", nextAction: "",
  }
}

describe("effectiveOrigin", () => {
  it("지시를 수행으로 강등한다", () => {
    expect(effectiveOrigin("지시", "수행")).toBe("수행")
  })

  it("논의를 수행으로 강등한다", () => {
    expect(effectiveOrigin("논의", "수행")).toBe("수행")
  })

  it("override가 없으면 휴리스틱을 그대로 쓴다", () => {
    expect(effectiveOrigin("지시", null)).toBe("지시")
    expect(effectiveOrigin("수행", null)).toBe("수행")
  })
})

describe("enforceRules", () => {
  it("수행 세션이 신규 과제를 참조하면 operationRef를 비운다", () => {
    const result: PromotionResult = {
      operations: [newOp("new:1")],
      sessions: [
        promoted({ sessionKey: "s-1", operationRef: "new:1" }),
        promoted({ sessionKey: "s-2", operationRef: "new:1" }),
      ],
    }
    const out = enforceRules(DAY, result)
    expect(out.sessions.find((s) => s.sessionKey === "s-1")!.operationRef).toBe("new:1")
    expect(out.sessions.find((s) => s.sessionKey === "s-2")!.operationRef).toBeNull()
  })

  it("LLM이 지시 세션을 수행으로 강등하면 신규 과제를 못 만든다", () => {
    // s-1은 휴리스틱상 지시지만 LLM이 디스패치로 판정
    const result: PromotionResult = {
      operations: [newOp("new:1")],
      sessions: [promoted({ sessionKey: "s-1", operationRef: "new:1", originOverride: "수행" })],
    }
    const out = enforceRules(DAY, result)
    expect(out.sessions[0].operationRef).toBeNull()
    expect(out.operations).toHaveLength(0)
  })

  it("수행 세션이 기존 과제를 참조하는 것은 허용한다", () => {
    const result: PromotionResult = {
      operations: [],
      sessions: [promoted({ sessionKey: "s-2", operationRef: "op-1" })],
    }
    expect(enforceRules(DAY, result).sessions[0].operationRef).toBe("op-1")
  })

  it("그날에 없는 세션 키는 버린다", () => {
    const result: PromotionResult = {
      operations: [],
      sessions: [promoted({ sessionKey: "s-999", name: "환각" })],
    }
    expect(enforceRules(DAY, result).sessions).toHaveLength(0)
  })

  it("아무 세션도 참조하지 않는 신규 과제는 버린다", () => {
    const result: PromotionResult = {
      operations: [newOp("new:9")],
      sessions: [],
    }
    expect(enforceRules(DAY, result).operations).toHaveLength(0)
  })
})

describe("promoteDay", () => {
  it("promoter 결과에 규칙을 적용해 돌려준다", async () => {
    const promoter = vi.fn().mockResolvedValue({
      operations: [],
      sessions: [promoted({ sessionKey: "s-2", operationRef: "new:1" })],
    } satisfies PromotionResult)

    const out = await promoteDay(DAY, EXISTING, promoter)
    expect(promoter).toHaveBeenCalledOnce()
    expect(out.sessions[0].operationRef).toBeNull()
  })
})
