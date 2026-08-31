import { describe, expect, it } from "vitest"
import { completionDateKey } from "./TodoStatsCards"
import { formatCompletionTimestamp } from "./TodoHistory"

describe("Todo completion datetime compatibility", () => {
  it("uses the date prefix of a full ISO completion timestamp for daily counts", () => {
    expect(completionDateKey("2026-08-25T09:10:11+09:00")).toBe("2026-08-25")
    expect(completionDateKey("2026-08-24T16:10:11Z")).toBe("2026-08-25")
    expect(completionDateKey("2026-08-25")).toBe("2026-08-25")
    expect(completionDateKey("not-a-date")).toBeNull()
    expect(completionDateKey(null)).toBeNull()
  })

  it("formats full ISO values in Asia/Seoul while preserving historical date-only values", () => {
    expect(formatCompletionTimestamp("2026-08-25T00:10:11Z")).toBe("2026-08-25 09:10")
    expect(formatCompletionTimestamp("2026-08-25T09:10:11+09:00")).toBe("2026-08-25 09:10")
    expect(formatCompletionTimestamp("2026-08-25")).toBe("2026-08-25")
  })
})
