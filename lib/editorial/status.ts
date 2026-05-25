import type {
  EditorialItem,
  EditorialStatus,
  Recommendation,
} from "@/lib/types/editorial"

// ─── 카테고리 정의 ────────────────────────────────────────────
// "내가 처리해야 하는 상태" — Status 가 *Review (writing) 거나 Received
export const REVIEW_STATUSES: readonly EditorialStatus[] = [
  "Received",
  "1st Review",
  "2nd Review",
  "3rd Review",
  "Under Review", // 레거시
] as const

// "내가 리뷰 제출은 했지만 편집자/다른 리뷰어 결정 대기" — 내 손 떠난 상태
export const REVIEW_DONE_STATUSES: readonly EditorialStatus[] = [
  "1st Review Done",
  "2nd Review Done",
  "3rd Review Done",
] as const

// "저자가 revision 중" — author 의 손에 있음
export const REVISION_STATUSES: readonly EditorialStatus[] = [
  "1st Revision",
  "2nd Revision",
  "3rd Revision",
  "Under Revision", // 레거시
] as const

export const TERMINAL_STATUSES: readonly EditorialStatus[] = [
  "Accepted",
  "Rejected",
] as const

// Recommendation 만으로도 결론이 난 케이스. Status 가 아직 review/revision 라도
// recommendation 이 Accept/Reject/Desk Reject 면 사실상 완료로 본다.
export const TERMINAL_RECOMMENDATIONS: readonly Recommendation[] = [
  "Accept",
  "Reject",
  "Desk Reject",
] as const

// ─── 단일 검사 ────────────────────────────────────────────────
type StateInput = Pick<EditorialItem, "status" | "recommendation">

function inList<T extends string>(list: readonly T[], v: string): boolean {
  return (list as readonly string[]).includes(v)
}

export function isTerminal(status: EditorialStatus): boolean {
  return inList(TERMINAL_STATUSES, status)
}

export function isEffectivelyTerminal(item: StateInput): boolean {
  if (isTerminal(item.status)) return true
  if (item.recommendation === null) return false
  return inList(TERMINAL_RECOMMENDATIONS, item.recommendation)
}

export function isEffectivelyActive(item: StateInput): boolean {
  return !isEffectivelyTerminal(item)
}

// ─── 메인 분류 ────────────────────────────────────────────────
// Status 가 1차 신호. Tak 이 직접 status 를 운영하므로 가장 신뢰할 수 있음.

// 1st/2nd/3rd Review (또는 Received) — Tak 이 지금 리뷰를 작성해야 함.
export function isPendingMyAction(item: StateInput): boolean {
  if (isEffectivelyTerminal(item)) return false
  return inList(REVIEW_STATUSES, item.status)
}

// 1st/2nd/3rd Revision — 저자가 수정 중, Tak 액션 없음.
export function isWaitingOnAuthor(item: StateInput): boolean {
  if (isEffectivelyTerminal(item)) return false
  return inList(REVISION_STATUSES, item.status)
}

// *Review Done — Tak 가 리뷰는 마쳤지만 편집자가 결정을 못 내리는 상태 (다른 리뷰어 대기 등).
// Tak 액션은 없음.
export function isAwaitingEditor(item: StateInput): boolean {
  if (isEffectivelyTerminal(item)) return false
  return inList(REVIEW_DONE_STATUSES, item.status)
}

// "Tak 가 손 떼고 누군가 대기 중" — Awaiting Editor + Revision (Awaiting Author) 둘 다 포함.
// Brian chat / dashboard 의 "Awaiting" 카운트 등 일괄 사용.
export function isSubmittedAwaiting(item: StateInput): boolean {
  return isAwaitingEditor(item) || isWaitingOnAuthor(item)
}

// ─── 완료된 원고의 결론 분류 ─────────────────────────────────
export type OutcomeCategory = "Accept" | "Reject" | "Desk Reject"

export function outcomeCategory(item: StateInput): OutcomeCategory | null {
  if (!isEffectivelyTerminal(item)) return null
  if (item.status === "Accepted") return "Accept"
  if (item.recommendation === "Desk Reject") return "Desk Reject"
  if (item.status === "Rejected") return "Reject"
  if (item.recommendation === "Accept") return "Accept"
  if (item.recommendation === "Reject") return "Reject"
  return "Reject"
}
