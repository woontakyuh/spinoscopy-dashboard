import type { EditorialStatus } from "@/lib/types/editorial"

export const ACTIVE_STATUSES: readonly EditorialStatus[] = [
  "Received",
  "Under Review",
  "Under Revision",
] as const

export const TERMINAL_STATUSES: readonly EditorialStatus[] = [
  "Accepted",
  "Rejected",
] as const

export function isActive(status: EditorialStatus): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(status)
}

export function isTerminal(status: EditorialStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status)
}
