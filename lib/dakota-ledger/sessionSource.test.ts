import { describe, expect, it, beforeAll, afterAll } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { IDLE_GATE_SECONDS, readAllSessions, readJsonSessions, readSessions } from "./sessionSource"

let dir: string
let dbPath: string
const NOW = Math.floor(Date.now() / 1000)

/**
 * Date를 "타임존 표기 없는 Asia/Seoul 로컬시각" 문자열로 포맷한다 (session_start/last_updated 형식).
 * parseSeoulNaive가 이 문자열을 다시 해석하면 원래 Date와 같은 시각으로 왕복된다.
 */
function seoulNaive(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`
}

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
  // 옛날 고정 타임스탬프 세션들은 실제 현재 시각(NOW) 기준으로 이미 한참 유휴 상태이므로
  // 유휴 게이트(C1a)가 새로 걸려도 계속 통과한다 — 기존 테스트가 그대로 유지된다.
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

  // (C1a) 유휴 게이트 전용 픽스처: 실제 현재 시각(NOW) 기준 상대 타임스탬프.
  db.exec(`
    INSERT INTO sessions VALUES
      ('s-active', 'telegram', ${NOW - 3600}, 5),
      ('s-idle',   'telegram', ${NOW - 20000}, 5);
    INSERT INTO messages (session_id, role, content, tool_name, timestamp) VALUES
      ('s-active', 'user',      '진행 중 지시', NULL, ${NOW - 3600}),
      ('s-active', 'assistant', '중간 답변',    NULL, ${NOW - 1800}),
      ('s-active', 'assistant', '10분 전 답변', NULL, ${NOW - 600}),
      ('s-idle',   'user',      '끝난 지시',    NULL, ${NOW - 20000}),
      ('s-idle',   'assistant', '중간 답변',    NULL, ${NOW - 15000}),
      ('s-idle',   'assistant', '3시간 전 답변', NULL, ${NOW - 10800});
  `)

  // (C1b) 실제 카운트 전용 픽스처: message_count 컬럼(3)이 실제 행 수(6)보다 작다.
  // 20260721_075652_688e347b 케이스(230 vs 3561)를 축소 재현한다.
  // >= 3 필터를 통과시키려고 컬럼 값은 3으로 둔다 — 이 필터 자체는 이번 수정 범위가 아니다.
  db.exec(`
    INSERT INTO sessions VALUES ('s-drift', 'telegram', ${NOW - 20000}, 3);
    INSERT INTO messages (session_id, role, content, tool_name, timestamp) VALUES
      ('s-drift', 'user',      '메시지1', NULL, ${NOW - 20000}),
      ('s-drift', 'assistant', '메시지2', NULL, ${NOW - 19000}),
      ('s-drift', 'user',      '메시지3', NULL, ${NOW - 18000}),
      ('s-drift', 'assistant', '메시지4', NULL, ${NOW - 17000}),
      ('s-drift', 'user',      '메시지5', NULL, ${NOW - 16000}),
      ('s-drift', 'assistant', '메시지6', NULL, ${NOW - 10800});
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

  it("(C1a) 가장 최근 메시지가 10분 전이면 제외한다 (아직 진행 중)", () => {
    const keys = readSessions(dbPath, 0).map((s) => s.sessionKey)
    expect(keys).not.toContain("s-active")
  })

  it("(C1a) 가장 최근 메시지가 3시간 전이면 포함한다 (유휴 게이트 통과)", () => {
    const keys = readSessions(dbPath, 0).map((s) => s.sessionKey)
    expect(keys).toContain("s-idle")
  })

  it("(C1a) 유휴 기준은 90분(5400초)이다", () => {
    expect(IDLE_GATE_SECONDS).toBe(5400)
  })

  it("(C1b) messageCount는 message_count 컬럼이 아니라 messages 테이블의 실제 행 수다", () => {
    const drift = readSessions(dbPath, 0).find((s) => s.sessionKey === "s-drift")!
    expect(drift.messageCount).toBe(6)
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

  // (C1a/C1b) JSON 쪽 유휴 게이트 + 실제 카운트 픽스처.
  // session_start를 진짜 "지금" 기준으로 두어 last_updated의 상대 오프셋이 의미를 갖게 한다.
  const now = new Date()
  write(
    "session_active.json",
    JSON.stringify({
      session_id: "j-active",
      platform: "telegram",
      session_start: seoulNaive(new Date(now.getTime() - 3600_000)),
      last_updated: seoulNaive(new Date(now.getTime() - 10 * 60_000)), // 10분 전 = 아직 진행 중
      message_count: 5,
      messages: [
        { role: "user", content: "진행 중 지시" },
        { role: "assistant", content: "중간 답변" },
        { role: "user", content: "추가 지시" },
      ],
    })
  )

  write(
    "session_idle.json",
    JSON.stringify({
      session_id: "j-idle",
      platform: "telegram",
      session_start: seoulNaive(new Date(now.getTime() - 4 * 3600_000)),
      last_updated: seoulNaive(new Date(now.getTime() - 3 * 3600_000)), // 3시간 전 = 유휴 게이트 통과
      message_count: 5,
      messages: [
        { role: "user", content: "끝난 지시" },
        { role: "assistant", content: "중간 답변" },
        { role: "assistant", content: "마지막 답변" },
      ],
    })
  )

  // message_count 컬럼(2, 3 미만이라 필터에 걸림)과 실제 messages.length(4)가 다르다.
  // 필터도 카운트도 실제 배열 길이를 써야 한다는 것을 함께 확인한다.
  write(
    "session_drift.json",
    JSON.stringify({
      session_id: "j-drift",
      platform: "telegram",
      session_start: seoulNaive(new Date(now.getTime() - 4 * 3600_000)),
      last_updated: seoulNaive(new Date(now.getTime() - 3 * 3600_000)),
      message_count: 2,
      messages: [
        { role: "user", content: "메시지1" },
        { role: "assistant", content: "메시지2" },
        { role: "user", content: "메시지3" },
        { role: "assistant", content: "메시지4" },
      ],
    })
  )

  // last_updated가 없는 옛 덤프 형식 — 유휴 게이트 없이 승격을 허용해야 한다.
  write(
    "session_legacy.json",
    JSON.stringify({
      session_id: "j-legacy",
      platform: "telegram",
      session_start: seoulNaive(new Date(now.getTime() - 5 * 60_000)), // 5분 전, last_updated 없음
      message_count: 3,
      messages: [
        { role: "user", content: "레거시1" },
        { role: "assistant", content: "레거시2" },
        { role: "user", content: "레거시3" },
      ],
    })
  )
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

  it("(C1a) last_updated가 10분 전이면 제외한다 (아직 진행 중)", () => {
    const keys = readJsonSessions(jsonDir, 0).map((s) => s.sessionKey)
    expect(keys).not.toContain("j-active")
  })

  it("(C1a) last_updated가 3시간 전이면 포함한다 (유휴 게이트 통과)", () => {
    const keys = readJsonSessions(jsonDir, 0).map((s) => s.sessionKey)
    expect(keys).toContain("j-idle")
  })

  it("(C1a) last_updated가 없으면 유휴 게이트 없이 승격을 허용한다 (레거시 덤프)", () => {
    const keys = readJsonSessions(jsonDir, 0).map((s) => s.sessionKey)
    expect(keys).toContain("j-legacy")
  })

  it("(C1b) messageCount는 message_count 필드가 아니라 messages.length다", () => {
    const drift = readJsonSessions(jsonDir, 0).find((s) => s.sessionKey === "j-drift")!
    expect(drift.messageCount).toBe(4)
  })

  it("(C1b) message_count 필드가 3 미만이어도 실제 messages.length가 3 이상이면 포함한다", () => {
    // j-drift: message_count 필드는 2(옛 필터라면 제외됐을 값)지만 실제 메시지는 4개다.
    const keys = readJsonSessions(jsonDir, 0).map((s) => s.sessionKey)
    expect(keys).toContain("j-drift")
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
