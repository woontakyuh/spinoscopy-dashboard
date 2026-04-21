import type {
  EditorialItem,
  EditorialStatus,
  Recommendation,
} from "@/lib/types/editorial"

export const ACTIVE_STATUSES: readonly EditorialStatus[] = [
  "Received",
  "Under Review",
  "Under Revision",
] as const

export const TERMINAL_STATUSES: readonly EditorialStatus[] = [
  "Accepted",
  "Rejected",
] as const

// Recommendation 만으로도 결론이 난 케이스. Minor/Major Revision 은 진행중 (저자 수정 대기),
// Peer Review/Pending/null 은 진행중. Accept/Reject/Desk Reject 는 terminal.
export const TERMINAL_RECOMMENDATIONS: readonly Recommendation[] = [
  "Accept",
  "Reject",
  "Desk Reject",
] as const

export function isActive(status: EditorialStatus): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(status)
}

export function isTerminal(status: EditorialStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status)
}

type TerminalInput = Pick<EditorialItem, "status" | "recommendation">

// status 만으로는 진행중이지만 recommendation 이 terminal 이면 실질 완료로 간주.
// 예: status="Under Review" + recommendation="Desk Reject" → 완료(거절).
export function isEffectivelyTerminal(item: TerminalInput): boolean {
  if (isTerminal(item.status)) return true
  if (item.recommendation === null) return false
  return (TERMINAL_RECOMMENDATIONS as readonly string[]).includes(item.recommendation)
}

export function isEffectivelyActive(item: TerminalInput): boolean {
  return !isEffectivelyTerminal(item)
}

export type OutcomeCategory = "Accept" | "Reject" | "Desk Reject"

// 완료 원고의 결론 분류. status 우선, 이후 recommendation 로 판정.
export function outcomeCategory(item: TerminalInput): OutcomeCategory | null {
  if (!isEffectivelyTerminal(item)) return null
  if (item.status === "Accepted") return "Accept"
  if (item.recommendation === "Desk Reject") return "Desk Reject"
  if (item.status === "Rejected") return "Reject"
  if (item.recommendation === "Accept") return "Accept"
  if (item.recommendation === "Reject") return "Reject"
  return "Reject"
}
