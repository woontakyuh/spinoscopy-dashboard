import { DatabaseSync } from "node:sqlite"
import { LEDGER_CHANNELS, type LedgerChannel, type RawSession } from "./types"

interface Row {
  id: string
  source: string
  started_at: number
  message_count: number
  first_user: string | null
  last_assistant: string | null
  tool_names: string | null
}

const QUERY = `
  SELECT
    s.id, s.source, s.started_at, s.message_count,
    (SELECT m.content FROM messages m
      WHERE m.session_id = s.id AND m.role = 'user' AND m.content IS NOT NULL
      ORDER BY m.timestamp ASC LIMIT 1) AS first_user,
    (SELECT m.content FROM messages m
      WHERE m.session_id = s.id AND m.role = 'assistant' AND m.content IS NOT NULL
      ORDER BY m.timestamp DESC LIMIT 1) AS last_assistant,
    (SELECT group_concat(DISTINCT m.tool_name) FROM messages m
      WHERE m.session_id = s.id AND m.tool_name IS NOT NULL) AS tool_names
  FROM sessions s
  WHERE s.source IN ('telegram','cli','tui','subagent')
    AND s.message_count >= 3
    AND s.started_at >= ?
  ORDER BY s.started_at ASC
`

/**
 * state.db를 읽기 전용으로 열어 승격 대상 세션을 뽑는다.
 * cron source와 message_count < 3 세션은 SQL 단계에서 걸러진다.
 */
export function readSessions(dbPath: string, sinceEpoch: number): RawSession[] {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const rows = db.prepare(QUERY).all(sinceEpoch) as unknown as Row[]
    return rows.map((r) => ({
      sessionKey: r.id,
      channel: r.source as LedgerChannel,
      startedAt: new Date(r.started_at * 1000).toISOString(),
      messageCount: r.message_count,
      firstUserMessage: (r.first_user ?? "").trim(),
      lastAssistantMessage: (r.last_assistant ?? "").trim(),
      toolNames: (r.tool_names ?? "").split(",").filter(Boolean),
    })).filter((s) => LEDGER_CHANNELS.includes(s.channel))
  } finally {
    db.close()
  }
}
