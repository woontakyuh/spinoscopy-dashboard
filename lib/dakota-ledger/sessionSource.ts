import { DatabaseSync } from "node:sqlite"
import { readdirSync, readFileSync } from "node:fs"
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

interface JsonToolCall {
  function?: { name?: string }
}

interface JsonMessage {
  role?: string
  content?: string | null
  tool_calls?: JsonToolCall[]
}

interface JsonSessionDump {
  session_id?: string
  platform?: string
  /** 타임존 표기가 없는 Asia/Seoul 로컬시각, 예: "2026-04-13T19:32:58.591873" */
  session_start?: string
  message_count?: number
  messages?: JsonMessage[]
}

const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000
const NAIVE_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/

/**
 * 타임존 표기가 없는 session_start를 Asia/Seoul 로컬시각으로 해석해 UTC Date로 바꾼다.
 * Date.UTC로 필드를 그대로 조립한 뒤 UTC+9 오프셋을 빼는 방식이라 실행 환경의 TZ 설정과 무관하다.
 */
function parseSeoulNaive(value: string): Date {
  const m = NAIVE_LOCAL_RE.exec(value)
  if (!m) throw new Error(`session_start를 해석할 수 없습니다: "${value}"`)
  const [, y, mo, d, h, mi, se, frac] = m
  const ms = frac ? Math.round(Number(`0.${frac}`) * 1000) : 0
  const asIfUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se), ms)
  return new Date(asIfUtc - SEOUL_OFFSET_MS)
}

function firstUserMessage(messages: JsonMessage[]): string {
  const m = messages.find((x) => x.role === "user" && x.content)
  return (m?.content ?? "").trim()
}

function lastAssistantMessage(messages: JsonMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === "assistant" && m.content) return m.content.trim()
  }
  return ""
}

function collectToolNames(messages: JsonMessage[]): string[] {
  const names: string[] = []
  for (const m of messages) {
    for (const call of m.tool_calls ?? []) {
      const name = call.function?.name
      if (name && !names.includes(name)) names.push(name)
    }
  }
  return names
}

/** 레거시 JSON 덤프에서 세션을 읽는다. state.db로의 이관이 불완전해 여기에만 남은 것이 있다. */
export function readJsonSessions(dir: string, sinceEpoch: number): RawSession[] {
  let files: string[]
  try {
    files = readdirSync(dir)
  } catch {
    return []
  }

  const sessions: RawSession[] = []
  for (const file of files) {
    if (!file.startsWith("session_") || !file.endsWith(".json")) continue

    let dump: JsonSessionDump
    try {
      dump = JSON.parse(readFileSync(`${dir}/${file}`, "utf8")) as JsonSessionDump
    } catch {
      continue
    }

    const channel = dump.platform as LedgerChannel
    if (!LEDGER_CHANNELS.includes(channel)) continue
    if (!dump.session_id || !dump.session_start) continue
    if ((dump.message_count ?? 0) < 3) continue

    let startedAt: Date
    try {
      startedAt = parseSeoulNaive(dump.session_start)
    } catch {
      continue
    }
    if (Math.floor(startedAt.getTime() / 1000) < sinceEpoch) continue

    const messages = dump.messages ?? []
    sessions.push({
      sessionKey: dump.session_id,
      channel,
      startedAt: startedAt.toISOString(),
      messageCount: dump.message_count ?? 0,
      firstUserMessage: firstUserMessage(messages),
      lastAssistantMessage: lastAssistantMessage(messages),
      toolNames: collectToolNames(messages),
    })
  }

  return sessions.sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0))
}

/** state.db와 JSON 덤프를 합친다. 같은 sessionKey는 state.db 쪽을 남긴다. */
export function readAllSessions(dbPath: string, jsonDir: string, sinceEpoch: number): RawSession[] {
  const sqliteSessions = readSessions(dbPath, sinceEpoch)
  const jsonSessions = readJsonSessions(jsonDir, sinceEpoch)

  const bySessionKey = new Map<string, RawSession>()
  for (const s of jsonSessions) bySessionKey.set(s.sessionKey, s)
  for (const s of sqliteSessions) bySessionKey.set(s.sessionKey, s) // state.db가 나중에 덮어써 이긴다

  return [...bySessionKey.values()].sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0))
}
