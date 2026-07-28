import { describe, expect, it } from "vitest"
import { conversationRowToSessionLogInput, conversationSessionKey, mapTopicsToDomain } from "./conversationIngest"
import type { ConversationRowInput } from "./conversationIngest"

function row(over: Partial<ConversationRowInput> = {}): ConversationRowInput {
  return {
    pageId: "page-1",
    title: "다음 학회 발표 방향 정리",
    date: "2026-07-15T09:00:00.000Z",
    summary: "발표 주제 후보 세 가지를 논의했다.",
    decisions: "",
    keyFacts: "",
    actionItems: "",
    topics: [],
    ...over,
  }
}

describe("mapTopicsToDomain", () => {
  it("단일 토픽을 정해진 도메인으로 매핑한다", () => {
    expect(mapTopicsToDomain(["strategy"])).toBe("Strategy")
    expect(mapTopicsToDomain(["project"])).toBe("Operations")
    expect(mapTopicsToDomain(["clinical"])).toBe("Clinical")
    expect(mapTopicsToDomain(["personal"])).toBe("Personal")
    expect(mapTopicsToDomain(["research"])).toBe("Research")
    expect(mapTopicsToDomain(["infra"])).toBe("Operations")
    expect(mapTopicsToDomain(["finance"])).toBe("Finance")
  })

  it("여러 토픽이 서로 다른 도메인에 걸치면 고정 우선순위상 앞선 토픽을 쓴다", () => {
    // 우선순위: strategy, project, clinical, personal, research, infra, finance
    expect(mapTopicsToDomain(["finance", "strategy"])).toBe("Strategy")
    expect(mapTopicsToDomain(["infra", "research"])).toBe("Research")
    expect(mapTopicsToDomain(["finance", "project"])).toBe("Operations")
  })

  it("토픽이 비어 있으면 null을 반환한다 (호출자가 LLM으로 분류해야 함)", () => {
    expect(mapTopicsToDomain([])).toBeNull()
  })
})

describe("conversationSessionKey", () => {
  it("conv: 접두사를 붙인다", () => {
    expect(conversationSessionKey("abc-123")).toBe("conv:abc-123")
  })
})

describe("conversationRowToSessionLogInput", () => {
  it("dedup 키·surface·origin·channel 기본값을 채운다", () => {
    const input = conversationRowToSessionLogInput(row(), "Strategy")
    expect(input.sessionKey).toBe("conv:page-1")
    expect(input.surface).toBe("Claude Desktop")
    expect(input.origin).toBe("논의")
    expect(input.channel).toBe("dashboard")
    expect(input.msgCount).toBe(0)
    expect(input.operationPageId).toBeNull()
    expect(input.date).toBe("2026-07-15T09:00:00.000Z")
    expect(input.domain).toBe("Strategy")
  })

  it("Decisions가 비어 있으면 Outcome은 진행이다", () => {
    const input = conversationRowToSessionLogInput(row({ decisions: "" }), "Strategy")
    expect(input.outcome).toBe("진행")
  })

  it("Decisions가 있으면 Outcome은 완료다", () => {
    const input = conversationRowToSessionLogInput(row({ decisions: "학회는 KSOR로 확정" }), "Strategy")
    expect(input.outcome).toBe("완료")
  })

  it("Decisions/Action Items가 있으면 각각 라벨 붙은 줄로 Summary에 덧붙인다", () => {
    const input = conversationRowToSessionLogInput(
      row({ decisions: "KSOR로 확정", actionItems: "초록 초안 작성" }),
      "Strategy"
    )
    expect(input.summary).toBe(
      "발표 주제 후보 세 가지를 논의했다.\n결정: KSOR로 확정\n실행 항목: 초록 초안 작성"
    )
  })

  it("Decisions/Action Items가 없으면 Summary만 담는다", () => {
    const input = conversationRowToSessionLogInput(row(), "Strategy")
    expect(input.summary).toBe("발표 주제 후보 세 가지를 논의했다.")
  })

  it("원본 Topics를 모두 Tags에 담는다", () => {
    const input = conversationRowToSessionLogInput(row({ topics: ["strategy", "personal"] }), "Strategy")
    expect(input.tags).toEqual(["strategy", "personal"])
  })
})
