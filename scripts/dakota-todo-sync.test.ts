import { describe, expect, it } from "vitest"
import { completedFromDateFilter, parseArgs } from "./dakota-todo-sync"

describe("dakota-todo-sync completion boundary", () => {
  it("uses an explicit KST midnight for Notion datetime filtering", () => {
    expect(completedFromDateFilter("2026-08-25")).toBe("2026-08-25T00:00:00+09:00")
    expect(completedFromDateFilter(null)).toBeUndefined()
  })

  it("preserves an explicit YYYY-MM-DD argument before boundary conversion", () => {
    expect(parseArgs(["--since", "2026-08-25", "--dry-run"])).toEqual({
      since: "2026-08-25",
      dryRun: true,
    })
  })
})
