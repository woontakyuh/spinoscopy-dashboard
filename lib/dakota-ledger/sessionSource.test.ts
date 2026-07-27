import { describe, expect, it, beforeAll, afterAll } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { readSessions } from "./sessionSource"

let dir: string
let dbPath: string

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "ledger-"))
  dbPath = path.join(dir, "state.db")
  const db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, source TEXT NOT NULL, started_at REAL NOT NULL,
      message_count INTEGER DEFAULT 0
    );
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL,
      role TEXT NOT NULL, content TEXT, tool_name TEXT, timestamp REAL NOT NULL
    );
  `)
  // 1000 = 1970-01-01T00:16:40Z, 2000 = ...00:33:20Z
  db.exec(`
    INSERT INTO sessions VALUES
      ('s-tg',   'telegram', 2000, 5),
      ('s-cli',  'cli',      2000, 4),
      ('s-cron', 'cron',     2000, 9),
      ('s-thin', 'telegram', 2000, 2),
      ('s-old',  'telegram', 1000, 7);
    INSERT INTO messages (session_id, role, content, tool_name, timestamp) VALUES
      ('s-tg', 'user',      '첫 지시입니다',  NULL,       2001),
      ('s-tg', 'assistant', '중간 답변',      NULL,       2002),
      ('s-tg', 'tool',      NULL,             'web_search', 2003),
      ('s-tg', 'tool',      NULL,             'web_search', 2004),
      ('s-tg', 'assistant', '마지막 답변',    NULL,       2005),
      ('s-cli','user',      'cli 지시',       NULL,       2001),
      ('s-cli','assistant', 'cli 답변',       NULL,       2002),
      ('s-old','user',      '옛날 지시',      NULL,       1001);
  `)
  db.close()
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("readSessions", () => {
  it("cron source를 제외한다", () => {
    const keys = readSessions(dbPath, 0).map((s) => s.sessionKey)
    expect(keys).not.toContain("s-cron")
  })

  it("message_count가 3 미만인 세션을 제외한다", () => {
    const keys = readSessions(dbPath, 0).map((s) => s.sessionKey)
    expect(keys).not.toContain("s-thin")
  })

  it("sinceEpoch 이전 세션을 제외한다", () => {
    const keys = readSessions(dbPath, 1500).map((s) => s.sessionKey)
    expect(keys).not.toContain("s-old")
    expect(keys).toContain("s-tg")
  })

  it("첫 사용자 메시지와 마지막 assistant 메시지를 뽑는다", () => {
    const tg = readSessions(dbPath, 0).find((s) => s.sessionKey === "s-tg")!
    expect(tg.firstUserMessage).toBe("첫 지시입니다")
    expect(tg.lastAssistantMessage).toBe("마지막 답변")
  })

  it("툴 이름을 중복 없이 모은다", () => {
    const tg = readSessions(dbPath, 0).find((s) => s.sessionKey === "s-tg")!
    expect(tg.toolNames).toEqual(["web_search"])
  })

  it("startedAt을 ISO 문자열로 변환한다", () => {
    const tg = readSessions(dbPath, 0).find((s) => s.sessionKey === "s-tg")!
    expect(tg.startedAt).toBe(new Date(2000 * 1000).toISOString())
  })

  it("결과를 시작 시각 오름차순으로 정렬한다", () => {
    const all = readSessions(dbPath, 0)
    const times = all.map((s) => s.startedAt)
    expect([...times].sort()).toEqual(times)
  })
})
