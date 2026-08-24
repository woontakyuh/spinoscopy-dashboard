import { describe, it, expect } from "vitest"
import { deriveCondition, CONDITIONS } from "./characterCondition"

const at = (daysSince: number | null, streak: number) =>
  deriveCondition({ daysSinceLastSession: daysSince, currentStreak: streak })

describe("deriveCondition", () => {
  it("4주 이상 연속이면 forged", () => {
    expect(at(1, 4).id).toBe("forged")
    expect(at(3, 11).id).toBe("forged")
  })

  it("붙고 있으면 steady", () => {
    expect(at(0, 1).id).toBe("steady")
    expect(at(5, 3).id).toBe("steady")
  })

  it("공백이 길어지면 연속 기록과 무관하게 내려간다", () => {
    // 6일 쉬면 4주 연속이었어도 forged 가 아니다 — 지금 상태를 보여야 한다
    expect(at(6, 11).id).toBe("rusty")
    expect(at(13, 4).id).toBe("rusty")
  })

  it("2주 넘게 비면 dormant", () => {
    expect(at(14, 11).id).toBe("dormant")
    expect(at(60, 0).id).toBe("dormant")
  })

  it("수련 기록이 아예 없으면 dormant", () => {
    expect(at(null, 0).id).toBe("dormant")
  })

  it("경계값에서 상태가 겹치지 않는다", () => {
    expect(at(5, 1).id).toBe("steady")
    expect(at(6, 1).id).toBe("rusty")
    expect(at(13, 1).id).toBe("rusty")
    expect(at(14, 1).id).toBe("dormant")
  })

  it("모든 상태에 라벨과 스타일이 있다", () => {
    for (const c of CONDITIONS) {
      expect(c.label.length).toBeGreaterThan(0)
      expect(c.tone.length).toBeGreaterThan(0)
      expect(typeof c.imageFilter).toBe("string")
    }
  })

  it("음수 일수는 0 으로 본다 (시계 어긋남 방어)", () => {
    expect(at(-1, 2).id).toBe("steady")
  })
})
