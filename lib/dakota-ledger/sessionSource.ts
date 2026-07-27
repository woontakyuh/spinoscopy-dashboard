import { DatabaseSync } from "node:sqlite"
import { readdirSync, readFileSync } from "node:fs"
import { LEDGER_CHANNELS, type LedgerChannel, type RawSession } from "./types"

/**
 * (C1a) 세션을 승격 대상으로 볼 유휴 기준(초). 가장 최근 메시지가 이보다 오래돼야 승격한다.
 * 진행 중인 세션이 09:00 런에 partial 내용으로 동결되는 것을 막는다 — 아직 활성인 세션은
 * 그냥 다음 실행을 기다리면 되고, dedup 키가 아직 없으니 잃는 것도 없다.
 */
export const IDLE_GATE_SECONDS = 90 * 60 // 5400

interface Row {
  id: string
  source: string
  started_at: number
  msg_count: number
  first_user: string | null
  last_assistant: string | null
  tool_names: string | null
}

const QUERY = `
  SELECT
    s.id, s.source, s.started_at,
    (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS msg_count,
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
    AND (SELECT MAX(m.timestamp) FROM messages m WHERE m.session_id = s.id)
          < strftime('%s','now') - ${IDLE_GATE_SECONDS}
  ORDER BY s.started_at ASC
`

/**
 * state.db를 읽기 전용으로 열어 승격 대상 세션을 뽑는다.
 * cron source, message_count < 3 세션, 그리고 유휴 게이트(C1a)를 통과 못한
 * (아직 진행 중인) 세션은 SQL 단계에서 걸러진다.
 *
 * messageCount는 s.message_count 컬럼이 아니라 messages 테이블의 실제 행 수다(C1b) —
 * 그 컬럼은 장수명 세션에서 갱신이 밀려 크게 과소평가될 수 있다.
 */
export function readSessions(dbPath: string, sinceEpoch: number): RawSession[] {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const rows = db.prepare(QUERY).all(sinceEpoch) as unknown as Row[]
    return rows.map((r) => ({
      sessionKey: r.id,
      channel: r.source as LedgerChannel,
      startedAt: new Date(r.started_at * 1000).toISOString(),
      messageCount: r.msg_count,
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
  /** session_start와 같은 형식(naive Asia/Seoul). 없으면 오래된 덤프 형식이다(C1a). */
  last_updated?: string
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

/**
 * (C1a) JSON 덤프에 대해서도 유휴 게이트를 적용한다. state.db와 달리 messages에
 * 신뢰할 타임스탬프 보장이 없으므로 last_updated(세션 파일이 마지막으로 쓰인 시각)로 판단한다.
 * last_updated가 없으면 옛 덤프 형식이라 이미 정지된 것으로 보고 승격을 허용한다.
 */
function isJsonSessionIdle(dump: JsonSessionDump, nowMs: number): boolean {
  if (!dump.last_updated) return true
  let lastUpdated: Date
  try {
    lastUpdated = parseSeoulNaive(dump.last_updated)
  } catch {
    return true
  }
  return nowMs - lastUpdated.getTime() >= IDLE_GATE_SECONDS * 1000
}

/** 레거시 JSON 덤프에서 세션을 읽는다. state.db로의 이관이 불완전해 여기에만 남은 것이 있다. */
export function readJsonSessions(dir: string, sinceEpoch: number, now: Date = new Date()): RawSession[] {
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

    const messages = dump.messages ?? []
    // (C1b) message_count 필드가 아니라 실제 messages 배열 길이를 쓴다 — state.db와 같은 이유.
    const messageCount = messages.length
    if (messageCount < 3) continue

    let startedAt: Date
    try {
      startedAt = parseSeoulNaive(dump.session_start)
    } catch {
      continue
    }
    if (Math.floor(startedAt.getTime() / 1000) < sinceEpoch) continue

    if (!isJsonSessionIdle(dump, now.getTime())) continue

    sessions.push({
      sessionKey: dump.session_id,
      channel,
      startedAt: startedAt.toISOString(),
      messageCount,
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
