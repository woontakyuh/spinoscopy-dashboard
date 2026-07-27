import { describe, expect, it, vi } from "vitest"
import { execFileSync } from "node:child_process"
import { buildPrompt, createCodexPromoter, effectiveOrigin, enforceRules, extractAgentMessage, promoteDay } from "./promote"
import type { PromotedOperation, PromotedSession, PromotionResult } from "./promote"
import type { ClassifiedSession, DaySessions } from "./types"

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }))
vi.mock("node:fs", () => ({ writeFileSync: vi.fn() }))

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
  it("수행 세션이 신규 과제를 참조하면 operationRef를 비운다 (지시/논의가 그 과제를 만들지 않은 경우)", () => {
    // s-1(지시)은 이 신규 과제를 참조하지 않는다 — new:1은 오직 수행 세션(s-2)만 참조한다.
    // I1 수정 후에도 "수행이 카드를 만든다"는 여전히 막혀야 한다.
    const result: PromotionResult = {
      operations: [newOp("new:1")],
      sessions: [
        promoted({ sessionKey: "s-1", operationRef: null }),
        promoted({ sessionKey: "s-2", operationRef: "new:1" }),
      ],
    }
    const out = enforceRules(DAY, result)
    expect(out.sessions.find((s) => s.sessionKey === "s-1")!.operationRef).toBeNull()
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

  it("LLM이 ref 규약을 어겨도 수행 세션은 신규 과제를 못 만든다", () => {
    // 프롬프트는 "new:1" 형식을 요구하지만 강제할 수단이 없다.
    // 접두사 판정만 있으면 이 케이스가 빠져나가 잡카드가 생긴다.
    const result: PromotionResult = {
      operations: [{ ...newOp("op-new-1") }],
      sessions: [promoted({ sessionKey: "s-2", operationRef: "op-new-1" })],
    }
    const out = enforceRules(DAY, result)
    expect(out.sessions[0].operationRef).toBeNull()
    expect(out.operations).toHaveLength(0)
  })

  it("수행 세션이 매달린 신규 ref를 참조해도 비운다", () => {
    // operations가 비어 있어 멤버십 판정으로는 안 잡히는 경우
    const result: PromotionResult = {
      operations: [],
      sessions: [promoted({ sessionKey: "s-2", operationRef: "new:9" })],
    }
    expect(enforceRules(DAY, result).sessions[0].operationRef).toBeNull()
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

  // I1: 지시 1건 + 수행 다건이 같은 배치에서 같은 신규 과제를 만드는 시나리오.
  // "카카오톡 분석 돌려줘" 지시 세션이 new:1을 만들고, 수행 서브에이전트 세션들이 거기 붙는다.
  const DAY_MIXED_ORIGIN: DaySessions = {
    date: "2026-07-20",
    sessions: [
      session({ sessionKey: "s-instruct", origin: "지시" }),
      session({ sessionKey: "s-exec-1", origin: "수행" }),
      session({ sessionKey: "s-exec-2", origin: "수행" }),
    ],
  }

  it("(I1) 지시 세션이 참조하는 신규 과제라면 수행 세션도 붙을 수 있다", () => {
    const result: PromotionResult = {
      operations: [newOp("new:1")],
      sessions: [
        promoted({ sessionKey: "s-instruct", operationRef: "new:1" }),
        promoted({ sessionKey: "s-exec-1", operationRef: "new:1" }),
        promoted({ sessionKey: "s-exec-2", operationRef: "new:1" }),
      ],
    }
    const out = enforceRules(DAY_MIXED_ORIGIN, result)
    expect(out.sessions.find((s) => s.sessionKey === "s-instruct")!.operationRef).toBe("new:1")
    expect(out.sessions.find((s) => s.sessionKey === "s-exec-1")!.operationRef).toBe("new:1")
    expect(out.sessions.find((s) => s.sessionKey === "s-exec-2")!.operationRef).toBe("new:1")
    expect(out.operations).toHaveLength(1)
  })

  it("(I1) 수행 세션만 참조하는 신규 과제는 여전히 비운다 (지시/논의가 안 만든 카드)", () => {
    const result: PromotionResult = {
      operations: [newOp("new:1")],
      sessions: [
        promoted({ sessionKey: "s-exec-1", operationRef: "new:1" }),
        promoted({ sessionKey: "s-exec-2", operationRef: "new:1" }),
      ],
    }
    const out = enforceRules(DAY_MIXED_ORIGIN, result)
    expect(out.sessions.find((s) => s.sessionKey === "s-exec-1")!.operationRef).toBeNull()
    expect(out.sessions.find((s) => s.sessionKey === "s-exec-2")!.operationRef).toBeNull()
    expect(out.operations).toHaveLength(0)
  })

  it("(부수 수정) 같은 sessionKey가 두 번 나오면 마지막 것만 남긴다", () => {
    const result: PromotionResult = {
      operations: [],
      sessions: [
        promoted({ sessionKey: "s-2", name: "첫 번째(버려져야 함)", operationRef: "op-1" }),
        promoted({ sessionKey: "s-2", name: "마지막", operationRef: null }),
      ],
    }
    const out = enforceRules(DAY, result)
    expect(out.sessions).toHaveLength(1)
    expect(out.sessions[0].name).toBe("마지막")
    expect(out.sessions[0].operationRef).toBeNull()
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

describe("extractAgentMessage", () => {
  // 실측 codex --json 출력 (2026-07-27)
  const REAL_OUTPUT = [
    "Reading additional input from stdin...",
    '{"type":"thread.started","thread_id":"019fa3cd-86c5-7ba3-a4a2-4e8131f754ee"}',
    '{"type":"turn.started"}',
    '{"type":"item.completed","item":{"id":"item_0","type":"error","message":"Skill descriptions were shortened to fit the 2% skills context budget."}}',
    '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"{\\"sessions\\":[]}"}}',
    '{"type":"turn.completed","usage":{"input_tokens":20934,"output_tokens":37}}',
  ].join("\n")

  it("실측 출력에서 agent_message 본문을 뽑는다", () => {
    expect(extractAgentMessage(REAL_OUTPUT)).toBe('{"sessions":[]}')
  })

  it("여러 agent_message 중 마지막 것을 고른다", () => {
    const jsonl = [
      '{"type":"item.completed","item":{"type":"agent_message","text":"first"}}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"second"}}',
    ].join("\n")
    expect(extractAgentMessage(jsonl)).toBe("second")
  })

  it("JSON이 아닌 줄을 건너뛴다", () => {
    const jsonl = [
      "Reading additional input from stdin...",
      '{"type":"item.completed","item":{"type":"agent_message","text":"ok"}}',
    ].join("\n")
    expect(extractAgentMessage(jsonl)).toBe("ok")
  })

  it("item.completed이지만 type이 error인 항목은 무시한다", () => {
    const jsonl = [
      '{"type":"item.completed","item":{"type":"error","message":"오류"}}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"real"}}',
    ].join("\n")
    expect(extractAgentMessage(jsonl)).toBe("real")
  })

  it("item.completed이지만 type이 error인 항목은 text가 있어도 무시한다", () => {
    // message만 있고 text가 없는 error는 truthy 체크만으로도 걸러진다 — 이 케이스는
    // error 항목에 text까지 채워 넣고, 진짜 agent_message보다 "뒤"에 두어 판별한다.
    // last를 계속 덮어쓰는 루프 구조상, type 체크가 없으면 뒤에 오는 이 error 항목의
    // text가 최종값을 덮어써 실패하게 된다 — fixture 순서만으로 우연히 통과하지 않는다.
    const jsonl = [
      '{"type":"item.completed","item":{"type":"agent_message","text":"actual"}}',
      '{"type":"item.completed","item":{"type":"error","message":"오류","text":"real"}}',
    ].join("\n")
    expect(extractAgentMessage(jsonl)).toBe("actual")
  })

  it("agent_message가 없으면 던지고, 메시지에 원본 꼬리가 담긴다", () => {
    const jsonl = [
      '{"type":"thread.started","thread_id":"abc"}',
      '{"type":"item.completed","item":{"type":"error","message":"실패"}}',
    ].join("\n")
    expect(() => extractAgentMessage(jsonl)).toThrow(jsonl.slice(-800))
  })
})

describe("createCodexPromoter (I2)", () => {
  it("execFileSync에 5분 timeout을 넘긴다 (겹쳐 도는 launchd 실행을 막기 위함)", async () => {
    vi.mocked(execFileSync).mockReturnValue(
      '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"operations\\":[],\\"sessions\\":[]}"}}'
    )
    const promoter = createCodexPromoter()
    await promoter("prompt")

    expect(execFileSync).toHaveBeenCalledOnce()
    const options = vi.mocked(execFileSync).mock.calls[0][2] as { timeout?: number }
    expect(options.timeout).toBe(5 * 60 * 1000)
  })
})
