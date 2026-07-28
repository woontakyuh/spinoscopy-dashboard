/**
 * Claude Desktop 대화 요약(Dakota Conversation Logs) -> Session Log 행 변환.
 *
 * Claude Desktop 대화는 서버 사이드라 사후 복구가 안 되고, 페르소나가 직접
 * Notion에 요약을 남기는 방식으로만 채워진다. 이 파일은 그 행을 장부 형식으로 바꾼다.
 */
import type { SessionLogInput } from "@/lib/notion/sessionLog"
import type { LedgerDomain } from "./types"

/** Conversation Logs DB의 Topics multi_select 값 -> LedgerDomain 고정 우선순위.
 *  여러 토픽이 서로 다른 도메인에 걸치면 이 배열에서 먼저 나오는 토픽이 이긴다. */
const TOPIC_DOMAIN_PRECEDENCE: Array<[topic: string, domain: LedgerDomain]> = [
  ["strategy", "Strategy"],
  ["project", "Operations"],
  ["clinical", "Clinical"],
  ["personal", "Personal"],
  ["research", "Research"],
  ["infra", "Operations"],
  ["finance", "Finance"],
]

/** 토픽이 비어 있거나(또는 알려진 토픽이 하나도 없으면) null을 반환한다 —
 *  호출자는 이 경우 Title+Summary를 LLM에 넘겨 분류해야 한다. */
export function mapTopicsToDomain(topics: string[]): LedgerDomain | null {
  const set = new Set(topics)
  for (const [topic, domain] of TOPIC_DOMAIN_PRECEDENCE) {
    if (set.has(topic)) return domain
  }
  return null
}

export interface ConversationRowInput {
  pageId: string
  title: string
  /** ISO 8601 */
  date: string
  summary: string
  decisions: string
  keyFacts: string
  actionItems: string
  topics: string[]
}

export function conversationSessionKey(pageId: string): string {
  return `conv:${pageId}`
}

function composeSummary(row: ConversationRowInput): string {
  const lines = [row.summary.trim()]
  if (row.decisions.trim()) lines.push(`결정: ${row.decisions.trim()}`)
  if (row.actionItems.trim()) lines.push(`실행 항목: ${row.actionItems.trim()}`)
  return lines.filter(Boolean).join("\n")
}

export function conversationRowToSessionLogInput(
  row: ConversationRowInput,
  domain: LedgerDomain
): SessionLogInput {
  return {
    name: row.title,
    date: row.date,
    channel: "dashboard",
    origin: "논의",
    agent: "dakota",
    domain,
    tags: row.topics,
    summary: composeSummary(row),
    outcome: row.decisions.trim() ? "완료" : "진행",
    msgCount: 0,
    sessionKey: conversationSessionKey(row.pageId),
    operationPageId: null,
    surface: "Claude Desktop",
  }
}
