import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_LO_PROFILE, type LoPromotionHistoryEntry } from "@/lib/types/lo-v2"
import { getLoProfile, listLoProfiles, loProfileProperties } from "./loProfile"

const ORIGINAL_ENV = { ...process.env }

const PROMOTION_HISTORY: LoPromotionHistoryEntry[] = [
  { date: "2019-11-27", belt: "white", stripes: 0, label: "화이트벨트 시작", ceremony: false },
  { date: "2020-06-20", belt: "white", stripes: 1, label: "화이트 1그랄", ceremony: false },
  { date: "2021-01-19", belt: "white", stripes: 2, label: "화이트 2그랄", ceremony: false },
  { date: "2023-11-10", belt: "white", stripes: 3, label: "화이트 3그랄", ceremony: false },
  { date: "2024-03-08", belt: "white", stripes: 4, label: "화이트 4그랄", ceremony: false },
  { date: "2024-07-19", belt: "blue", stripes: 0, label: "블루벨트 승급", ceremony: false },
  { date: "2025-09-26", belt: "blue", stripes: 1, label: "블루 1그랄", ceremony: true },
  { date: "2025-09-26", belt: "blue", stripes: 2, label: "블루 2그랄", ceremony: true },
  { date: "2026-03-20", belt: "blue", stripes: 3, label: "블루 3그랄", ceremony: true },
]

const PROFILE_PAGE = {
  id: "profile-1",
  url: "https://notion.so/profile-1",
  properties: {
    Name: { type: "title", title: [{ plain_text: "여운탁" }] },
    Belt: { type: "select", select: { name: "blue" } },
    Stripes: { type: "number", number: 3 },
    "Training Start Date": { type: "date", date: { start: "2019-11-27" } },
    Gym: { type: "rich_text", rich_text: [{ plain_text: "DT Wire" }] },
    Instructor: { type: "rich_text", rich_text: [{ plain_text: "조준용" }] },
    Role: { type: "select", select: { name: "student" } },
    "Avatar URL": { type: "url", url: null },
    "Promotion History": { type: "rich_text", rich_text: [{ plain_text: JSON.stringify(PROMOTION_HISTORY) }] },
    "Gi Guard": { type: "number", number: 0 },
    "Gi Passing": { type: "number", number: 0 },
    "Gi Control": { type: "number", number: 0 },
    "Gi Finishing": { type: "number", number: 0 },
    "Gi Takedowns": { type: "number", number: 0 },
    "Gi Leg Locks": { type: "number", number: 0 },
    "No-Gi Guard": { type: "number", number: 0 },
    "No-Gi Passing": { type: "number", number: 0 },
    "No-Gi Control": { type: "number", number: 0 },
    "No-Gi Finishing": { type: "number", number: 0 },
    "No-Gi Takedowns": { type: "number", number: 0 },
    "No-Gi Leg Locks": { type: "number", number: 0 },
  },
}

beforeEach(() => {
  process.env.NOTION_TOKEN = "test-token"
  process.env.NOTION_LO_PROFILE_DB_ID = "lo-profile-db"
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.unstubAllGlobals()
})

describe("Lo Profile accessor", () => {
  it("maps the seeded profile without losing zero-valued BJJ attributes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [PROFILE_PAGE], has_more: false, next_cursor: null }),
    }))

    await expect(getLoProfile()).resolves.toEqual({
      pageId: "profile-1",
      url: "https://notion.so/profile-1",
      name: "여운탁",
      belt: "blue",
      stripes: 3,
      trainingStartDate: "2019-11-27",
      gym: "DT Wire",
      instructor: "조준용",
      role: "student",
      avatarUrl: null,
      promotionHistory: PROMOTION_HISTORY,
      baseStats: {
        gi: { guard: 0, passing: 0, control: 0, finishing: 0, takedowns: 0, legLocks: 0 },
        nogi: { guard: 0, passing: 0, control: 0, finishing: 0, takedowns: 0, legLocks: 0 },
      },
    })
  })

  it("serializes promotion history as deterministic human-readable JSON", () => {
    expect(loProfileProperties({
      ...DEFAULT_LO_PROFILE,
      promotionHistory: PROMOTION_HISTORY,
    })["Promotion History"]).toEqual({
      rich_text: [{ text: { content: JSON.stringify(PROMOTION_HISTORY) } }],
    })
  })

  it("rejects a malformed Promotion History property instead of silently falling back", async () => {
    const malformedProfile = {
      ...PROFILE_PAGE,
      properties: {
        ...PROFILE_PAGE.properties,
        "Promotion History": { type: "rich_text", rich_text: [{ plain_text: "not JSON" }] },
      },
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [malformedProfile], has_more: false, next_cursor: null }),
    }))

    await expect(getLoProfile()).rejects.toThrow(/malformed Promotion History.*valid JSON/)
  })

  it("follows every result page and carries the sort over to the cursor request", async () => {
    const secondProfile = {
      ...PROFILE_PAGE,
      id: "profile-2",
      properties: {
        ...PROFILE_PAGE.properties,
        Name: { type: "title", title: [{ plain_text: "Second profile" }] },
      },
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [PROFILE_PAGE], has_more: true, next_cursor: "cursor-1" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [secondProfile], has_more: false, next_cursor: null }),
      })
    vi.stubGlobal("fetch", fetchMock)

    await expect(listLoProfiles()).resolves.toHaveLength(2)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      page_size: 100,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      page_size: 100,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      start_cursor: "cursor-1",
    })
  })

  it("fails loudly rather than silently returning a partial profile list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [PROFILE_PAGE], has_more: true, next_cursor: null }),
    }))

    await expect(listLoProfiles()).rejects.toThrow(/next_cursor/)
  })

  it("requires the dedicated Lo Profile database id", async () => {
    delete process.env.NOTION_LO_PROFILE_DB_ID
    await expect(getLoProfile()).rejects.toThrow("NOTION_LO_PROFILE_DB_ID")
  })
})
