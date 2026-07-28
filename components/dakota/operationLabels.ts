import type { OperationItem } from "@/lib/notion/operations"
import type { SessionLogItem } from "@/lib/notion/sessionLog"

export type OperationStatus = OperationItem["status"]

export type OperationsResponse = { configured: boolean; operations: OperationItem[] }
export type SessionsResponse = { configured: boolean; sessions: SessionLogItem[] }

/** 상태 드롭다운/버튼에 노출할 순서. Archived는 드러내지 않고 나머지 4개만 조작 가능하게 둔다. */
export const STATUS_ORDER: OperationStatus[] = ["In Progress", "Waiting", "Inbox", "Completed"]

export const STATUS_LABEL: Record<string, string> = {
  Inbox: "미분류",
  "In Progress": "진행중",
  Waiting: "대기",
  Completed: "완료",
  Archived: "보관",
}

export const STATUS_TONE: Record<string, string> = {
  Inbox: "bg-violet-400/10 text-violet-200",
  "In Progress": "bg-sky-400/10 text-sky-200",
  Waiting: "bg-amber-400/10 text-amber-200",
  Completed: "bg-emerald-400/10 text-emerald-200",
  Archived: "bg-zinc-400/10 text-zinc-400",
}

export const DOMAIN_LABEL: Record<string, string> = {
  Strategy: "전략·기회",
  Clinical: "임상",
  Research: "KSOR·연구",
  AI: "AI·시스템",
  Finance: "재무·투자",
  Training: "수련",
  Family: "가족",
  Personal: "개인",
  Operations: "운영",
}

export const DOMAIN_TONE: Record<string, string> = {
  Strategy: "bg-violet-400/10 text-violet-200",
  Clinical: "bg-orange-400/10 text-orange-200",
  Research: "bg-blue-400/10 text-blue-200",
  AI: "bg-cyan-400/10 text-cyan-200",
  Finance: "bg-lime-400/10 text-lime-200",
  Training: "bg-fuchsia-400/10 text-fuchsia-200",
  Family: "bg-emerald-400/10 text-emerald-200",
  Personal: "bg-pink-400/10 text-pink-200",
  Operations: "bg-zinc-400/10 text-zinc-300",
}

export const PRIORITY_ORDER: Record<string, number> = { High: 3, Medium: 2, Low: 1 }

export const PRIORITY_TONE: Record<string, string> = {
  High: "text-red-300",
  Medium: "text-amber-200",
  Low: "text-zinc-400",
}

/**
 * 카테고리별 현황 매트릭스 전용 어휘. 사용자가 실제로 쓰는 말(시행중/시행함/...)로 —
 * 상세 드로어의 상태 버튼(STATUS_LABEL)과는 의도적으로 다르다.
 */
export const MATRIX_STATUS_ORDER: OperationStatus[] = ["In Progress", "Waiting", "Completed", "Inbox", "Archived"]

export const MATRIX_STATUS_LABEL: Record<OperationStatus, string> = {
  "In Progress": "시행중",
  Waiting: "대기",
  Completed: "시행함",
  Inbox: "미분류",
  Archived: "보관",
}

/**
 * 차트 계열 색상. dataviz 스킬의 카테고리 8슬롯(고정 순서, 다크모드용)을 그대로 쓴다.
 * Training은 라이브 데이터에 사실상 나타나지 않는 9번째 도메인이라 전용 슬롯을 주지 않고
 * 중립색으로 폴백한다 — "9번째 계열은 생성색이 아니라 기타로 접는다" 규칙.
 */
export const DOMAIN_CHART_COLOR: Record<string, string> = {
  Strategy: "#3987e5", // slot 1 blue
  Clinical: "#d95926", // slot 2 orange
  Research: "#199e70", // slot 3 aqua
  AI: "#c98500", // slot 4 yellow
  Finance: "#d55181", // slot 5 magenta
  Family: "#008300", // slot 6 green
  Personal: "#9085e9", // slot 7 violet
  Operations: "#e66767", // slot 8 red
  Training: "#71717a", // fallback (사실상 데이터 없음)
}

export async function fetchOperations(): Promise<OperationsResponse> {
  const response = await fetch("/api/dakota/operations")
  if (!response.ok) throw new Error("운영 기록을 불러오지 못했습니다.")
  return response.json()
}

export async function fetchSessions(): Promise<SessionsResponse> {
  const response = await fetch("/api/dakota/ledger/sessions")
  if (!response.ok) throw new Error("세션 기록을 불러오지 못했습니다.")
  return response.json()
}

export async function updateOperationStatus(pageId: string, status: OperationStatus): Promise<void> {
  const response = await fetch("/api/dakota/operations", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page_id: pageId, status }),
  })
  if (!response.ok) throw new Error("상태 변경에 실패했습니다.")
}
