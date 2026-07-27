import { describe, expect, it } from "vitest"
import { nextOperationCounts, parseArgs } from "./dakota-ledger-sync"

const DAY = 86_400

describe("parseArgs", () => {
  it("--since 날짜를 KST 자정 epoch로 바꾼다", () => {
    const { since } = parseArgs(["--since", "2026-04-13"])
    // 2026-04-13 00:00 KST == 2026-04-12T15:00:00Z
    expect(since).toBe(Date.parse("2026-04-12T15:00:00.000Z") / 1000)
  })

  it("--since today는 오늘 KST 자정이다", () => {
    const { since } = parseArgs(["--since", "today"])
    const now = Math.floor(Date.now() / 1000)
    expect(since).toBeLessThanOrEqual(now)
    expect(now - since).toBeLessThan(DAY + 3600)
  })

  it("--since yesterday는 today보다 하루 이르다", () => {
    expect(parseArgs(["--since", "today"]).since - parseArgs(["--since", "yesterday"]).since).toBe(DAY)
  })

  it("--since 없으면 0이다", () => {
    expect(parseArgs([]).since).toBe(0)
  })

  it("--dry-run을 인식한다", () => {
    expect(parseArgs(["--dry-run"]).dryRun).toBe(true)
    expect(parseArgs([]).dryRun).toBe(false)
  })

  it("알 수 없는 --since 값은 던진다", () => {
    expect(() => parseArgs(["--since", "무엇"])).toThrow("--since")
  })
})

describe("nextOperationCounts", () => {
  it("base가 없으면 0에서 시작해 델타를 더한다", () => {
    expect(nextOperationCounts(undefined, { count: 2, msgs: 30 })).toEqual({ count: 2, msgs: 30 })
  })

  it("base 위에 델타를 더한 절대값을 반환한다 (I2: 델타 누적이 아니라 절대값 재계산)", () => {
    expect(nextOperationCounts({ count: 5, msgs: 100 }, { count: 2, msgs: 30 })).toEqual({ count: 7, msgs: 130 })
  })

  it("델타가 0이어도 base를 그대로 보존한다", () => {
    expect(nextOperationCounts({ count: 5, msgs: 100 }, { count: 0, msgs: 0 })).toEqual({ count: 5, msgs: 100 })
  })
})
