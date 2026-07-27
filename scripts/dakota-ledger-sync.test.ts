import { describe, expect, it } from "vitest"
import { parseArgs } from "./dakota-ledger-sync"

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
