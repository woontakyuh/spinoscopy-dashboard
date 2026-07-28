/**
 * Dashboard To-Do 완료 항목 -> Session Log 행 변환.
 *
 * 90/91건이 Category=일상업무라 Category를 그대로 domain에 매핑하면 도메인별
 * 비중 차트가 무의미해진다. 그래서 domain은 이 함수 밖(LLM 분류)에서 정해 들어오고,
 * 원래 Category는 Tags에만 남긴다 — 값을 잃지 않으면서 집계축은 의미 있게 유지한다.
 */
import type { TodoItem } from "@/lib/notion/todo"
import type { SessionLogInput } from "@/lib/notion/sessionLog"
import type { LedgerDomain } from "./types"

export function todoSessionKey(pageId: string): string {
  return `todo:${pageId}`
}

export function todoToSessionLogInput(todo: TodoItem, domain: LedgerDomain): SessionLogInput {
  if (!todo.completed_at) {
    throw new Error(`todoToSessionLogInput: completed_at이 없는 to-do는 변환할 수 없습니다 (${todo.page_id})`)
  }

  return {
    name: todo.name,
    date: todo.completed_at,
    channel: "dashboard",
    origin: "지시",
    agent: "dakota",
    domain,
    tags: todo.category ? [todo.category] : [],
    summary: todo.notes ?? "",
    outcome: "완료",
    msgCount: 0,
    sessionKey: todoSessionKey(todo.page_id),
    operationPageId: null,
    surface: "Dashboard",
  }
}
