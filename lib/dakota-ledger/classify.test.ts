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
  })

  // (I5) produce/summarize/compare/draft/generate/collect/research는 더 이상 길이 무관
  // 강판정이 아니다 — 짧으면 실제 지시일 가능성이 높다.
  it("(I5) 짧은 produce/summarize/draft 지시는 수행이 아니라 지시로 남는다", () => {
    expect(classifyOrigin(raw({ firstUserMessage: "Produce a detailed Korean briefing" }))).toBe("지시")
    expect(classifyOrigin(raw({ firstUserMessage: "Summarize this thread" }))).toBe("지시")
    expect(classifyOrigin(raw({ firstUserMessage: "Draft an email to 김교수님" }))).toBe("지시")
  })

  it("(I5) 같은 동사라도 120자를 넘으면 여전히 수행이다", () => {
    const longSummarize = "Summarize this entire thread into a single Korean paragraph, " +
      "focusing only on decisions that were actually made, and drop any tangents about " +
      "unrelated topics so the output stays under one screen of text."
    expect(longSummarize.length).toBeGreaterThanOrEqual(120)
    expect(classifyOrigin(raw({ firstUserMessage: longSummarize }))).toBe("수행")
  })

  it("페르소나 지정 프롬프트는 수행", () => {
    expect(classifyOrigin(raw({ firstUserMessage: "You are Andrej, AI specialist." }))).toBe("수행")
    expect(classifyOrigin(raw({ firstUserMessage: "Brian으로서 이번 주 논문을 정리해" }))).toBe("수행")
    expect(classifyOrigin(raw({ firstUserMessage: "As Warren, give a cold view on SpaceX IPO" }))).toBe("수행")
  })

  it("일상 한국어 '~로서'는 수행이 아니다", () => {
    // 오탐 시 센터장님의 실제 지시가 칸반에서 사라진다
    expect(classifyOrigin(raw({ firstUserMessage: "의사로서 이 환자는 수술이 필요해 보이는데 어떻게 생각해?" }))).toBe("지시")
    expect(classifyOrigin(raw({ firstUserMessage: "부모로서 걱정되는 부분이 있어" }))).toBe("지시")
  })

  it("cron 산출물이 텔레그램으로 유입된 것은 수행", () => {
    expect(classifyOrigin(raw({ firstUserMessage: "Cronjob Response: ExoBrain wiki sync ---" }))).toBe("수행")
  })

  // 실제 state.db에서 '지시'로 오분류됐던 문구들 (2026-07-27 실측).
  // 실제 본문은 193~674자다. 길이 게이트를 지나야 하므로 발췌가 아니라
  // 실측 길이대에 맞춘 전문을 쓴다.
  it.each([
    "Audit the current ExoBrain LLM Wiki sync implementation for correctness. " +
      "Report the exact input delta and the outputs created, and confirm the legacy " +
      "compiler was not invoked at any point during the run.",
    "Write the final standalone report for 에르메스단. Start exactly with the header " +
      "and cover the last 24 hours only. Exclude 잡담, 레퍼럴, 모집, and repeated model praise. " +
      "Keep every claim traceable to a message in the transcript.",
    "Design a concrete capability and approval policy for six agents. Identify which " +
      "actions each agent may take unattended, which require approval, and which are " +
      "forbidden outright. Justify each boundary in one sentence.",
    "Create a concise high-signal AI/social update brief in Korean from the collected " +
      "transcripts. Drop anything promotional or repetitive, and keep at most two items " +
      "per source so the brief stays readable in a single screen.",
  ])("실측 오분류 회귀: %s", (text) => {
    expect(text.length).toBeGreaterThanOrEqual(120)
    expect(classifyOrigin(raw({ firstUserMessage: text }))).toBe("수행")
  })

  // 실제 센터장님 발화. 보강한 동사 목록에 걸리면 안 된다.
  it.each([
    ["My experience of the Aside was amazing… Thanks for developing this", 5],
    ["hermes gaitway start", 8],
    ["chatGPT 서버 터지면서 뻑났었ㄷ는듯?", 8],
  ])("사용자 발화는 지시로 남는다: %s", (text, count) => {
    expect(classifyOrigin(raw({ firstUserMessage: text, messageCount: count as number }))).toBe("지시")
  })

  // 일상 영어 동사로 시작하는 짧은 지시. 길이 게이트가 없으면 수행으로 삼켜진다.
  // 강등은 단방향(지시->수행)이라 과탐은 되돌릴 수 없다.
  it.each([
    "Create a to-do for tomorrow OR list",
    "Design a workout split for this week",
    "Write this down: call the hospital at 3pm",
    "Audit my expenses for July",
    "Act as devil advocate on this plan",
    "Find my Jeju rental car booking",
    "Review my schedule for Friday",
  ])("짧은 일상 영어 지시는 지시로 남는다: %s", (text) => {
    expect(classifyOrigin(raw({ firstUserMessage: text }))).toBe("지시")
  })

  it("같은 동사라도 충분히 길면 디스패치로 본다", () => {
    // 실측 디스패치는 최소 193자
    const long = "Audit the current ExoBrain LLM Wiki sync implementation for correctness, " +
      "then report the exact input delta and the outputs created. Do not run the legacy " +
      "compiler and do not write to the legacy directory under any circumstance."
    expect(long.length).toBeGreaterThanOrEqual(120)
    expect(classifyOrigin(raw({ firstUserMessage: long }))).toBe("수행")
  })

  // (I5) 이 테스트는 원래 과탐(버그)을 고정하고 있었다: 개발자가 채팅에 실제 경로를
  // 붙여 넣는 것("이거 /tmp/hermes.log 왜 에러나?")은 실제 지시이지 디스패치가 아니다.
  // /tmp/ 포함만으로 수행 판정하면 그런 지시가 칸반에서 통째로 사라진다.
  it("(I5) 짧은 문장에 /tmp/ 경로가 섞여도 지시로 남는다", () => {
    expect(classifyOrigin(raw({ firstUserMessage: "이거 /tmp/dump.json 봐줘" }))).toBe("지시")
  })

  it("(I5) 길게 쓰인 /tmp/ 포함 디스패치는 여전히 수행이다", () => {
    const longTmpDispatch = "Check /tmp/hermes.log for the exact stack trace from the last crash, " +
      "then cross-reference it against the deploy timestamp and report which commit " +
      "introduced the regression. Do not modify any files under /tmp/ while investigating."
    expect(longTmpDispatch.length).toBeGreaterThanOrEqual(120)
    expect(classifyOrigin(raw({ firstUserMessage: longTmpDispatch }))).toBe("수행")
  })

  it("(I5) 트림된 길이 119/120 경계", () => {
    const body119 = `audit ${"x".repeat(113)}` // "audit " 6자 + 113자 = 119
    const body120 = `audit ${"x".repeat(114)}` // "audit " 6자 + 114자 = 120
    expect(body119.length).toBe(119)
    expect(body120.length).toBe(120)
    // 앞에 공백을 더해도(옛 버그라면 이걸로 게이트를 통과) 트림된 길이만 봐야 한다.
    expect(classifyOrigin(raw({ firstUserMessage: `   ${body119}` }))).toBe("지시")
    expect(classifyOrigin(raw({ firstUserMessage: `   ${body120}` }))).toBe("수행")
  })

  it("(부수 수정) 첫 메시지가 비어 있으면 수행으로 분류한다 (카드를 만들 자격 없음)", () => {
    expect(classifyOrigin(raw({ firstUserMessage: "" }))).toBe("수행")
    expect(classifyOrigin(raw({ firstUserMessage: "   " }))).toBe("수행")
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
