import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createSessionLog, readSessionLogSnapshot } from "./sessionLog"
import type { SessionLogInput } from "./sessionLog"

const OLD_ENV = { ...process.env }

function mockFetchOnce(payload: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  })
}

beforeEach(() => {
  process.env.NOTION_TOKEN = "test-token"
  process.env.NOTION_DAKOTA_SESSION_LOG_DB_ID = "db-1"
})

afterEach(() => {
  process.env = { ...OLD_ENV }
  vi.unstubAllGlobals()
})

function sessionLogPage(overrides: {
  key?: string
  msgCount?: number
  operationId?: string
}) {
  return {
    properties: {
      "Session Key": {
        type: "rich_text",
        rich_text: overrides.key ? [{ plain_text: overrides.key }] : [],
      },
      "Msg Count": { type: "number", number: overrides.msgCount ?? 0 },
      Operation: {
        type: "relation",
        relation: overrides.operationId ? [{ id: overrides.operationId }] : [],
      },
    },
  }
}

describe("readSessionLogSnapshot", () => {
  it("페이지네이션을 따라가며 Session Key를 모은다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [sessionLogPage({ key: "s-1" })],
          has_more: true,
          next_cursor: "cur-1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [sessionLogPage({ key: "s-2" })],
          has_more: false,
          next_cursor: null,
        }),
      })
    vi.stubGlobal("fetch", fetchMock)

    const snapshot = await readSessionLogSnapshot()
    expect(snapshot.keys).toEqual(new Set(["s-1", "s-2"]))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // 커서를 실제로 넘겼는지까지 봐야 한다. 호출 횟수만 세면
    // next_cursor를 무시하고 같은 질의를 두 번 보내도 통과한다.
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).start_cursor).toBeUndefined()
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).start_cursor).toBe("cur-1")
  })

  it("(I3) has_more가 true인데 next_cursor가 없으면 던진다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [sessionLogPage({ key: "s-1" })],
        has_more: true,
        next_cursor: null,
      }),
    }))

    await expect(readSessionLogSnapshot()).rejects.toThrow(/next_cursor/)
  })

  it("DB 미설정이면 빈 스냅샷을 준다", async () => {
    delete process.env.NOTION_DAKOTA_SESSION_LOG_DB_ID
    const snapshot = await readSessionLogSnapshot()
    expect(snapshot.keys.size).toBe(0)
    expect(snapshot.byOperation.size).toBe(0)
  })

  it("Operation relation이 비어 있으면 keys에는 담고 byOperation에는 담지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [sessionLogPage({ key: "s-solo", msgCount: 7 })],
        has_more: false,
        next_cursor: null,
      }),
    }))

    const snapshot = await readSessionLogSnapshot()
    expect(snapshot.keys).toEqual(new Set(["s-solo"]))
    expect(snapshot.byOperation.size).toBe(0)
  })

  it("같은 과제에 걸린 두 행의 Msg Count를 합산하고 건수를 2로 센다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          sessionLogPage({ key: "s-a", msgCount: 10, operationId: "op-1" }),
          sessionLogPage({ key: "s-b", msgCount: 15, operationId: "op-1" }),
        ],
        has_more: false,
        next_cursor: null,
      }),
    }))

    const snapshot = await readSessionLogSnapshot()
    expect(snapshot.byOperation.get("op-1")).toEqual({ count: 2, msgs: 25 })
  })
})

describe("createSessionLog", () => {
  const input: SessionLogInput = {
    name: "제주 렌터카 확정", date: "2026-07-15T13:41:00.000Z",
    channel: "tui", origin: "지시", agent: "dakota", domain: "Family",
    tags: ["여행"], summary: "제주패스 로그인 후 렌터카 예약 진행",
    outcome: "완료", msgCount: 80, sessionKey: "s-42",
    operationPageId: "op-1",
  }

  it("page_id를 반환한다", async () => {
    vi.stubGlobal("fetch", mockFetchOnce({ id: "page-9" }))
    await expect(createSessionLog(input)).resolves.toBe("page-9")
  })

  it("모든 속성을 Notion 형식으로 보낸다", async () => {
    const fetchMock = mockFetchOnce({ id: "page-9" })
    vi.stubGlobal("fetch", fetchMock)
    await createSessionLog(input)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.parent).toEqual({ database_id: "db-1" })
    expect(body.properties.Name.title[0].text.content).toBe("제주 렌터카 확정")
    expect(body.properties.Date.date.start).toBe("2026-07-15T13:41:00.000Z")
    expect(body.properties.Channel.select.name).toBe("tui")
    expect(body.properties.Origin.select.name).toBe("지시")
    expect(body.properties.Agent.select.name).toBe("dakota")
    expect(body.properties.Domain.select.name).toBe("Family")
    expect(body.properties.Summary.rich_text[0].text.content).toBe("제주패스 로그인 후 렌터카 예약 진행")
    expect(body.properties.Outcome.select.name).toBe("완료")
    expect(body.properties.Tags.multi_select).toEqual([{ name: "여행" }])
    expect(body.properties["Msg Count"].number).toBe(80)
    expect(body.properties["Session Key"].rich_text[0].text.content).toBe("s-42")
    expect(body.properties.Operation.relation).toEqual([{ id: "op-1" }])
  })

  it("operationPageId가 없으면 relation을 빈 배열로 보낸다", async () => {
    const fetchMock = mockFetchOnce({ id: "page-9" })
    vi.stubGlobal("fetch", fetchMock)
    await createSessionLog({ ...input, operationPageId: null })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.properties.Operation.relation).toEqual([])
  })

  it("DB 미설정이면 던진다", async () => {
    delete process.env.NOTION_DAKOTA_SESSION_LOG_DB_ID
    await expect(createSessionLog(input)).rejects.toThrow("NOTION_DAKOTA_SESSION_LOG_DB_ID")
  })
})
