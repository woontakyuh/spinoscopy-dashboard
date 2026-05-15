import type { ResearchStatus, ResearchProject } from "@/lib/types/research"

// Tak 이 지금 직접 작업하는 단계 — 펜이 그의 손에 있음.
export const TAK_WORKING_STATUSES: readonly ResearchStatus[] = [
  "Idea",
  "Lit Review",
  "Drafting",
  "Editing",
  "Revision",
  // 레거시
  "WNS",
  "Manuscript drafting",
  "\bManscript drafting",
] as const

// 저널 측 응답 대기 — 보냈고 결과 기다림.
export const JOURNAL_WAITING_STATUSES: readonly ResearchStatus[] = [
  "Submitted",
  "Under Review",
  "2nd Review",
] as const

// 종료 상태.
export const RESEARCH_TERMINAL_STATUSES: readonly ResearchStatus[] = [
  "Accepted",
  "Published",
  "Rejected",
] as const

type StatusInput = Pick<ResearchProject, "status">

function inList<T extends string>(list: readonly T[], v: string): boolean {
  return (list as readonly string[]).includes(v)
}

export function isTakWorking(p: StatusInput): boolean {
  return inList(TAK_WORKING_STATUSES, p.status)
}

export function isWaitingOnJournal(p: StatusInput): boolean {
  return inList(JOURNAL_WAITING_STATUSES, p.status)
}

export function isResearchTerminal(p: StatusInput): boolean {
  return inList(RESEARCH_TERMINAL_STATUSES, p.status)
}

export function isResearchHold(p: StatusInput): boolean {
  return p.status === "Hold"
}

export type ResearchBucket = "working" | "waiting" | "terminal" | "hold"

export function researchBucket(p: StatusInput): ResearchBucket {
  if (isResearchHold(p)) return "hold"
  if (isResearchTerminal(p)) return "terminal"
  if (isWaitingOnJournal(p)) return "waiting"
  return "working"
}
