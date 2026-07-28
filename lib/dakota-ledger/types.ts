export type LedgerOrigin = "지시" | "논의" | "수행"

export type LedgerChannel = "telegram" | "cli" | "tui" | "subagent" | "dashboard"

export type LedgerDomain =
  | "Strategy" | "Clinical" | "Research" | "AI" | "Finance"
  | "Training" | "Family" | "Personal" | "Operations"

export type LedgerAgent = "dakota" | "elon" | "brian" | "andrej" | "warren" | "lo"

export type LedgerOutcome = "완료" | "진행" | "보류" | "단발조회"

/** Dakota가 운영되는 표면. 세션이 어디서 발생했는지 (과제/Operation에는 표면이 없다). */
export type LedgerSurface = "Hermes" | "Dashboard" | "Claude Desktop"

export const LEDGER_SURFACES: LedgerSurface[] = ["Hermes", "Dashboard", "Claude Desktop"]

export const LEDGER_CHANNELS: LedgerChannel[] = ["telegram", "cli", "tui", "subagent", "dashboard"]

export const LEDGER_DOMAINS: LedgerDomain[] = [
  "Strategy", "Clinical", "Research", "AI", "Finance",
  "Training", "Family", "Personal", "Operations",
]

/** state.db에서 읽어낸 가공 전 세션 */
export interface RawSession {
  sessionKey: string
  channel: LedgerChannel
  /** ISO 8601 UTC */
  startedAt: string
  messageCount: number
  firstUserMessage: string
  lastAssistantMessage: string
  toolNames: string[]
}

/** Origin 판정이 끝난 세션 */
export interface ClassifiedSession extends RawSession {
  origin: LedgerOrigin
}

/** KST 날짜로 묶인 하루치 */
export interface DaySessions {
  /** YYYY-MM-DD (Asia/Seoul) */
  date: string
  sessions: ClassifiedSession[]
}
