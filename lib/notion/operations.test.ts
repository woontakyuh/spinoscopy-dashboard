import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OPERATION_DOMAINS, createOperation, getOperations, listAllOperationPageIds, updateOperation } from "./operations"

const OLD_ENV = { ...process.env }

beforeEach(() => {
  process.env.NOTION_TOKEN = "test-token"
  process.env.NOTION_DAKOTA_OPERATIONS_DB_ID = "ops-db"
})

afterEach(() => {
  process.env = { ...OLD_ENV }
  vi.unstubAllGlobals()
})

const PAGE = {
  id: "op-1",
  url: "https://notion.so/op-1",
  created_time: "2026-07-01T00:00:00.000Z",
  last_edited_time: "2026-07-20T00:00:00.000Z",
  properties: {
    Name: { type: "title", title: [{ plain_text: "KSOR governance" }] },
    Status: { type: "select", select: { name: "In Progress" } },
    Type: { type: "select", select: { name: "Decision" } },
    Domain: { type: "select", select: { name: "Research" } },
    Priority: { type: "select", select: { name: "High" } },
    Tags: { type: "multi_select", multi_select: [{ name: "AI" }, { name: "Governance" }] },
    "Started At": { type: "date", date: { start: "2026-07-01" } },
    "Last Touched": { type: "date", date: { start: "2026-07-20" } },
    "Session Count": { type: "number", number: 5 },
    "Msg Total": { type: "number", number: 312 },
    Context: { type: "rich_text", rich_text: [] },
    "Action Taken": { type: "rich_text", rich_text: [] },
    Result: { type: "rich_text", rich_text: [] },
    "Next Action": { type: "rich_text", rich_text: [] },
  },
}

describe("OPERATION_DOMAINS", () => {
  it("Finance와 Training을 포함해 9개다", () => {
    expect(OPERATION_DOMAINS).toHaveLength(9)
    expect(OPERATION_DOMAINS).toContain("Finance")
    expect(OPERATION_DOMAINS).toContain("Training")
  })
})

describe("getOperations", () => {
  it("확장 속성을 매핑한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ results: [PAGE] }),
    }))
    const [item] = await getOperations()
    expect(item.tags).toEqual(["AI", "Governance"])
    expect(item.started_at).toBe("2026-07-01")
    expect(item.last_touched).toBe("2026-07-20")
    expect(item.session_count).toBe(5)
    expect(item.msg_total).toBe(312)
  })

  it("확장 속성이 비어 있어도 기본값으로 떨어진다", async () => {
    // 라이브 DB에는 아직 이 5개 속성이 없다. 다섯 개 전부 폴백을 확인한다.
    const bare = { ...PAGE, properties: { ...PAGE.properties } }
    for (const key of ["Tags", "Started At", "Last Touched", "Session Count", "Msg Total"]) {
      delete (bare.properties as Record<string, unknown>)[key]
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ results: [bare] }),
    }))
    const [item] = await getOperations()
    expect(item.tags).toEqual([])
    expect(item.started_at).toBeNull()
    expect(item.last_touched).toBeNull()
    expect(item.session_count).toBe(0)
    expect(item.msg_total).toBe(0)
  })
})

describe("createOperation", () => {
  it("Finance 도메인과 태그를 전송한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => PAGE })
    vi.stubGlobal("fetch", fetchMock)
    await createOperation({
      name: "비트코인 CLARITY Act 점검",
      domain: "Finance",
      tags: ["규제", "BTC"],
      started_at: "2026-07-18",
    })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.properties.Domain.select.name).toBe("Finance")
    expect(body.properties.Tags.multi_select).toEqual([{ name: "규제" }, { name: "BTC" }])
    expect(body.properties["Started At"].date).toEqual({ start: "2026-07-18" })
  })
})

describe("listAllOperationPageIds", () => {
  it("페이지네이션을 따라가며 두 페이지의 id를 모두 모은다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ id: "op-1" }], has_more: true, next_cursor: "cur-1" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ id: "op-2" }], has_more: false, next_cursor: null }),
      })
    vi.stubGlobal("fetch", fetchMock)

    const ids = await listAllOperationPageIds()
    expect(ids).toEqual(new Set(["op-1", "op-2"]))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).start_cursor).toBeUndefined()
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).start_cursor).toBe("cur-1")
  })

  it("Visibility 필터를 걸지 않는다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [], has_more: false, next_cursor: null }),
    })
    vi.stubGlobal("fetch", fetchMock)

    await listAllOperationPageIds()
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).not.toHaveProperty("filter")
  })
})

describe("updateOperation", () => {
  it("Last Touched와 집계 수치를 갱신한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal("fetch", fetchMock)
    await updateOperation("op-1", { last_touched: "2026-07-27", session_count: 7, msg_total: 400 })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.properties["Last Touched"].date).toEqual({ start: "2026-07-27" })
    expect(body.properties["Session Count"].number).toBe(7)
    expect(body.properties["Msg Total"].number).toBe(400)
  })

  it("변경 항목이 없으면 요청하지 않는다", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    await updateOperation("op-1", {})
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
