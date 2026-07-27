import { describe, expect, it, beforeAll, afterAll } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { readAllSessions, readJsonSessions, readSessions } from "./sessionSource"

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

let jsonDir: string

beforeAll(() => {
  jsonDir = path.join(dir, "sessions")
  mkdirSync(jsonDir, { recursive: true })

  const write = (name: string, content: string) => writeFileSync(path.join(jsonDir, name), content)

  write(
    "session_cron.json",
    JSON.stringify({
      session_id: "j-cron",
      platform: "cron",
      session_start: "2026-04-14T09:00:00.000000",
      message_count: 9,
      messages: [
        { role: "user", content: "정기 작업" },
        { role: "assistant", content: "실행함" },
        { role: "assistant", content: "완료" },
      ],
    })
  )

  write(
    "session_thin.json",
    JSON.stringify({
      session_id: "j-thin",
      platform: "cli",
      session_start: "2026-04-14T09:00:00.000000",
      message_count: 2,
      messages: [
        { role: "user", content: "짧음" },
        { role: "assistant", content: "짧은 답" },
      ],
    })
  )

  write(
    "session_tz.json",
    JSON.stringify({
      session_id: "j-tz",
      platform: "telegram",
      session_start: "2026-04-13T19:32:58",
      message_count: 3,
      messages: [
        { role: "user", content: "안녕 dakota" },
        { role: "assistant", content: "어 왔네" },
        { role: "user", content: "일정 확인해봐" },
      ],
    })
  )

  write(
    "session_tools.json",
    JSON.stringify({
      session_id: "j-tools",
      platform: "cli",
      session_start: "2026-04-15T10:00:00.000000",
      message_count: 4,
      messages: [
        { role: "user", content: "검색해줘" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            { function: { name: "web_search" } },
            { function: { name: "web_search" } },
          ],
        },
        {
          role: "assistant",
          content: null,
          tool_calls: [{ function: { name: "read_file" } }],
        },
        { role: "assistant", content: "찾았어" },
      ],
    })
  )

  // s-tg는 SQLite 쪽에도 있는 세션 키 — SQLite 값이 이겨야 한다
  write(
    "session_dup.json",
    JSON.stringify({
      session_id: "s-tg",
      platform: "telegram",
      session_start: "2026-01-01T00:00:00.000000",
      message_count: 999,
      messages: [
        { role: "user", content: "JSON 쪽 첫 메시지 (버려져야 함)" },
        { role: "assistant", content: "JSON 쪽 마지막 답변 (버려져야 함)" },
      ],
    })
  )

  write("session_broken.json", "{ this is not valid json ][")
  write("not-a-session.txt", "그냥 텍스트 파일")
})

describe("readJsonSessions", () => {
  it("cron platform을 제외한다", () => {
    const keys = readJsonSessions(jsonDir, 0).map((s) => s.sessionKey)
    expect(keys).not.toContain("j-cron")
  })

  it("message_count가 3 미만인 세션을 제외한다", () => {
    const keys = readJsonSessions(jsonDir, 0).map((s) => s.sessionKey)
    expect(keys).not.toContain("j-thin")
  })

  it("session_start를 Asia/Seoul 로컬시각으로 해석한다", () => {
    const s = readJsonSessions(jsonDir, 0).find((x) => x.sessionKey === "j-tz")!
    expect(s.startedAt).toBe("2026-04-13T10:32:58.000Z")
  })

  it("tool_calls[].function.name을 중복 없이 모은다", () => {
    const s = readJsonSessions(jsonDir, 0).find((x) => x.sessionKey === "j-tools")!
    expect(s.toolNames).toEqual(["web_search", "read_file"])
  })

  it("깨진 JSON 파일과 JSON이 아닌 파일은 건너뛰고 예외를 던지지 않는다", () => {
    expect(() => readJsonSessions(jsonDir, 0)).not.toThrow()
    const keys = readJsonSessions(jsonDir, 0).map((s) => s.sessionKey)
    expect(keys).not.toContain("session_broken")
    expect(keys).not.toContain("not-a-session")
  })

  it("존재하지 않는 디렉터리는 빈 배열을 반환한다", () => {
    expect(readJsonSessions(path.join(dir, "no-such-dir"), 0)).toEqual([])
  })
})

describe("readAllSessions", () => {
  it("state.db와 JSON 덤프를 합친다", () => {
    const keys = readAllSessions(dbPath, jsonDir, 0).map((s) => s.sessionKey)
    expect(keys).toContain("s-tg") // sqlite
    expect(keys).toContain("j-tz") // json 전용
    expect(keys).toContain("j-tools") // json 전용
  })

  it("같은 sessionKey는 state.db 쪽 값을 남긴다", () => {
    const merged = readAllSessions(dbPath, jsonDir, 0).find((s) => s.sessionKey === "s-tg")!
    expect(merged.messageCount).toBe(5)
    expect(merged.firstUserMessage).toBe("첫 지시입니다")
  })

  it("같은 sessionKey를 중복으로 담지 않는다", () => {
    const keys = readAllSessions(dbPath, jsonDir, 0).map((s) => s.sessionKey)
    expect(keys.filter((k) => k === "s-tg")).toHaveLength(1)
  })

  it("존재하지 않는 JSON 디렉터리라도 SQLite 결과는 그대로 반환한다", () => {
    const sqliteOnly = readSessions(dbPath, 0).map((s) => s.sessionKey).sort()
    const merged = readAllSessions(dbPath, path.join(dir, "no-such-dir"), 0)
      .map((s) => s.sessionKey)
      .sort()
    expect(merged).toEqual(sqliteOnly)
  })

  it("결과를 시작 시각 오름차순으로 정렬한다", () => {
    const all = readAllSessions(dbPath, jsonDir, 0)
    const times = all.map((s) => s.startedAt)
    expect([...times].sort()).toEqual(times)
  })
})
