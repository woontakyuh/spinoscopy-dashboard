import { describe, expect, it } from "vitest"
import { todoSessionKey, todoToSessionLogInput } from "./todoIngest"
import type { TodoItem } from "@/lib/notion/todo"

function todo(over: Partial<TodoItem> = {}): TodoItem {
  return {
    page_id: "page-1",
    name: "택배 발송",
    due: null,
    status: "Done",
    priority: "Medium",
    category: "일상업무",
    notes: "",
    url: "https://notion.so/page-1",
    created_at: "2026-07-01",
    completed_at: "2026-07-10",
    source_ref: null,
    ...over,
  }
}

describe("todoSessionKey", () => {
  it("todo: 접두사를 붙인다", () => {
    expect(todoSessionKey("abc-123")).toBe("todo:abc-123")
  })
})

describe("todoToSessionLogInput", () => {
  it("dedup 키·날짜·기본값을 채운다", () => {
    const input = todoToSessionLogInput(todo(), "Personal")
    expect(input.sessionKey).toBe("todo:page-1")
    expect(input.date).toBe("2026-07-10")
    expect(input.surface).toBe("Dashboard")
    expect(input.origin).toBe("지시")
    expect(input.outcome).toBe("완료")
    expect(input.channel).toBe("dashboard")
    expect(input.msgCount).toBe(0)
    expect(input.operationPageId).toBeNull()
    expect(input.name).toBe("택배 발송")
    expect(input.domain).toBe("Personal")
  })

  it("Notes가 있으면 summary로 쓴다", () => {
    const input = todoToSessionLogInput(todo({ notes: "택배사 CJ" }), "Personal")
    expect(input.summary).toBe("택배사 CJ")
  })

  it("Notes가 없으면 summary는 빈 문자열이다", () => {
    const input = todoToSessionLogInput(todo({ notes: "" }), "Personal")
    expect(input.summary).toBe("")
  })

  it("원래 Category를 Tags에 담아 보존한다 (도메인 분류와 별개로)", () => {
    const input = todoToSessionLogInput(todo({ category: "연구" }), "Research")
    expect(input.tags).toEqual(["연구"])
  })

  it("completed_at이 없으면 던진다", () => {
    expect(() => todoToSessionLogInput(todo({ completed_at: null }), "Personal")).toThrow(/completed_at/)
  })
})
