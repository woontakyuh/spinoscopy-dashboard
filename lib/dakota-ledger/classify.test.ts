import { describe, expect, it } from "vitest"
import {
  buildDayContext, classifyOrigin, classifySessions,
  groupByDay, toSeoulDate, truncateSession,
} from "./classify"
import type { ClassifiedSession, RawSession } from "./types"

function raw(over: Partial<RawSession> = {}): RawSession {
  return {
    sessionKey: "k", channel: "telegram", startedAt: "2026-07-20T04:00:00.000Z",
    messageCount: 5, firstUserMessage: "정리 좀 해줘", lastAssistantMessage: "네",
    toolNames: [], ...over,
  }
}

describe("classifyOrigin", () => {
  it("subagent 채널은 항상 수행", () => {
    expect(classifyOrigin(raw({ channel: "subagent", firstUserMessage: "안녕" }))).toBe("수행")
  })

  it("영어 명령형으로 시작하면 수행", () => {
    expect(classifyOrigin(raw({ firstUserMessage: "Analyze /tmp/kakao.json and report" }))).toBe("수행")
    expect(classifyOrigin(raw({ firstUserMessage: "Produce a detailed Korean briefing" }))).toBe("수행")
  })

  it("페르소나 지정 프롬프트는 수행", () => {
    expect(classifyOrigin(raw({ firstUserMessage: "You are Andrej, AI specialist." }))).toBe("수행")
    expect(classifyOrigin(raw({ firstUserMessage: "Brian으로서 이번 주 논문을 정리해" }))).toBe("수행")
  })

  it("파일 경로가 섞이면 수행", () => {
    expect(classifyOrigin(raw({ firstUserMessage: "이거 /tmp/dump.json 봐줘" }))).toBe("수행")
  })

  it("한글 장문 대화는 논의", () => {
    expect(classifyOrigin(raw({ firstUserMessage: "알리바바 플랜 정리 좀", messageCount: 239 }))).toBe("논의")
  })

  it("한글 단문은 지시", () => {
    expect(classifyOrigin(raw({ firstUserMessage: "렌트카 빌리는거 진행해", messageCount: 8 }))).toBe("지시")
  })

  it("cli 짧은 질문도 지시", () => {
    expect(classifyOrigin(raw({ channel: "cli", firstUserMessage: "hermes gaitway start", messageCount: 8 }))).toBe("지시")
  })
})

describe("toSeoulDate", () => {
  it("UTC를 KST 날짜로 변환한다", () => {
    expect(toSeoulDate("2026-07-20T04:00:00.000Z")).toBe("2026-07-20")
  })

  it("UTC 늦은 밤은 KST 다음 날이 된다", () => {
    expect(toSeoulDate("2026-07-20T16:00:00.000Z")).toBe("2026-07-21")
  })
})

describe("groupByDay", () => {
  it("KST 날짜로 묶고 날짜 오름차순으로 반환한다", () => {
    const sessions = classifySessions([
      raw({ sessionKey: "a", startedAt: "2026-07-20T16:00:00.000Z" }),
      raw({ sessionKey: "b", startedAt: "2026-07-20T04:00:00.000Z" }),
      raw({ sessionKey: "c", startedAt: "2026-07-20T05:00:00.000Z" }),
    ])
    const days = groupByDay(sessions)
    expect(days.map((d) => d.date)).toEqual(["2026-07-20", "2026-07-21"])
    expect(days[0].sessions.map((s) => s.sessionKey)).toEqual(["b", "c"])
    expect(days[1].sessions.map((s) => s.sessionKey)).toEqual(["a"])
  })
})

describe("truncateSession", () => {
  it("상한을 넘지 않는다", () => {
    const s: ClassifiedSession = { ...raw({ firstUserMessage: "가".repeat(5000) }), origin: "지시" }
    expect(truncateSession(s, 2000).length).toBeLessThanOrEqual(2000)
  })

  it("세션 키·채널·Origin·툴 이름을 담는다", () => {
    const s: ClassifiedSession = { ...raw({ sessionKey: "s-1", toolNames: ["web_search"] }), origin: "지시" }
    const out = truncateSession(s)
    expect(out).toContain("s-1")
    expect(out).toContain("telegram")
    expect(out).toContain("지시")
    expect(out).toContain("web_search")
  })
})

describe("buildDayContext", () => {
  it("세션이 상한을 넘으면 Msg Count 상위만 상세로 담는다", () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      ({ ...raw({ sessionKey: `s${i}`, messageCount: i, firstUserMessage: `본문${i}` }), origin: "지시" as const })
    )
    const out = buildDayContext({ date: "2026-07-18", sessions: many }, 10)
    // 가장 큰 s14는 상세(본문 포함), 가장 작은 s0은 제목만
    expect(out).toContain("본문14")
    expect(out).toContain("s0")
    expect(out).not.toContain("본문0")
  })

  it("날짜를 머리말에 넣는다", () => {
    const one = [{ ...raw(), origin: "지시" as const }]
    expect(buildDayContext({ date: "2026-07-18", sessions: one })).toContain("2026-07-18")
  })
})
