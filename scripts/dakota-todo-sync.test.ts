import { describe, expect, it } from "vitest"
import { completedFromDateFilter, isFreshTodo, parseArgs } from "./dakota-todo-sync"

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

  it("does not re-ingest a reconciled To-Do whose source session already exists", () => {
    const keys = new Set(["session:original"])
    expect(isFreshTodo({ page_id: "todo-1", source_ref: "session:original" }, keys)).toBe(false)
    expect(isFreshTodo({ page_id: "todo-2", source_ref: "telegram:work" }, keys)).toBe(true)
    expect(isFreshTodo({ page_id: "todo-3", source_ref: null }, new Set(["todo:todo-3"]))).toBe(false)
  })
})
