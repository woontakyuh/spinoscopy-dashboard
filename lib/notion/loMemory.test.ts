import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createLoMemory, listLoMemories, supersedeLoMemory } from "./loMemory"

const ORIGINAL_ENV = { ...process.env }

const MEMORY_PAGE = {
  id: "memory-1",
  url: "https://notion.so/memory-1",
  created_time: "2026-08-01T00:00:00.000Z",
  last_edited_time: "2026-08-02T00:00:00.000Z",
  properties: {
    Name: { type: "title", title: [{ plain_text: "Half guard priority" }] },
    Content: { type: "rich_text", rich_text: [{ plain_text: "Prioritize the underhook." }] },
    Category: { type: "select", select: { name: "rule" } },
    Status: { type: "select", select: { name: "active" } },
    Importance: { type: "number", number: 5 },
    "Source Type": { type: "select", select: { name: "bjj_training" } },
    "Source Reference": { type: "rich_text", rich_text: [{ plain_text: "bjj-page-42" }] },
    "Source Captured At": { type: "date", date: { start: "2026-08-01T09:00:00.000Z" } },
    Supersedes: { type: "rich_text", rich_text: [] },
    "Superseded By": { type: "rich_text", rich_text: [] },
    "Superseded At": { type: "date", date: null },
  },
}

const MEMORY_INPUT = {
  name: "Half guard priority",
  content: "Prioritize the underhook.",
  category: "rule" as const,
  importance: 5,
  source: {
    kind: "bjj_training" as const,
    reference: "bjj-page-42",
    capturedAt: "2026-08-01T09:00:00.000Z",
  },
}

beforeEach(() => {
  process.env.NOTION_TOKEN = "test-token"
  process.env.NOTION_LO_MEMORY_DB_ID = "lo-memory-db"
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.unstubAllGlobals()
})

describe("Lo Memory retrieval", () => {
  it("defaults to active durable memories, maps source metadata, and paginates", async () => {
    const secondPage = { ...MEMORY_PAGE, id: "memory-2" }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [MEMORY_PAGE], has_more: true, next_cursor: "cursor-1" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [secondPage], has_more: false, next_cursor: null }),
      })
    vi.stubGlobal("fetch", fetchMock)

    const memories = await listLoMemories()

    expect(memories).toHaveLength(2)
    expect(memories[0]).toMatchObject({
      pageId: "memory-1",
      status: "active",
      category: "rule",
      importance: 5,
      source: {
        kind: "bjj_training",
        reference: "bjj-page-42",
        capturedAt: "2026-08-01T09:00:00.000Z",
      },
      supersedes: null,
      supersededBy: null,
      supersededAt: null,
    })
    for (const call of fetchMock.mock.calls) {
      expect(JSON.parse(call[1].body).filter).toEqual({
        property: "Status",
        select: { equals: "active" },
      })
    }
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).start_cursor).toBe("cursor-1")
  })

  it("filters retrieval by category and source metadata without reading transcripts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [], has_more: false, next_cursor: null }),
    })
    vi.stubGlobal("fetch", fetchMock)

    await listLoMemories({
      category: "rule",
      sourceKind: "bjj_training",
      sourceReference: "bjj-page-42",
      minImportance: 4,
    })

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).filter).toEqual({
      and: [
        { property: "Status", select: { equals: "active" } },
        { property: "Category", select: { equals: "rule" } },
        { property: "Source Type", select: { equals: "bjj_training" } },
        { property: "Source Reference", rich_text: { contains: "bjj-page-42" } },
        { property: "Importance", number: { greater_than_or_equal_to: 4 } },
      ],
    })
  })

  it("fails loudly if a Notion result page cannot be continued", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [MEMORY_PAGE], has_more: true, next_cursor: null }),
    }))

    await expect(listLoMemories()).rejects.toThrow(/next_cursor/)
  })
})

describe("Lo Memory lifecycle", () => {
  it("creates a durable fact with source metadata and no transcript field", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => MEMORY_PAGE })
    vi.stubGlobal("fetch", fetchMock)

    await expect(createLoMemory(MEMORY_INPUT)).resolves.toMatchObject({ pageId: "memory-1" })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.parent).toEqual({ database_id: "lo-memory-db" })
    expect(body.properties.Name.title[0].text.content).toBe("Half guard priority")
    expect(body.properties.Content.rich_text[0].text.content).toBe("Prioritize the underhook.")
    expect(body.properties.Category.select.name).toBe("rule")
    expect(body.properties.Status.select.name).toBe("active")
    expect(body.properties.Importance.number).toBe(5)
    expect(body.properties["Source Type"].select.name).toBe("bjj_training")
    expect(body.properties["Source Reference"].rich_text[0].text.content).toBe("bjj-page-42")
    expect(body.properties["Source Captured At"].date.start).toBe("2026-08-01T09:00:00.000Z")
    expect(body.properties).not.toHaveProperty("Transcript")
  })

  it("replaces a memory by linking the successor and marking the prior row superseded", async () => {
    const successor = { ...MEMORY_PAGE, id: "memory-2", url: "https://notion.so/memory-2" }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => successor })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "memory-2" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "memory-1" }) })
    vi.stubGlobal("fetch", fetchMock)

    await expect(supersedeLoMemory({
      pageId: "memory-1",
      replacement: MEMORY_INPUT,
      supersededAt: "2026-08-03T00:00:00.000Z",
    })).resolves.toMatchObject({ pageId: "memory-2" })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1][0]).toContain("/pages/memory-2")
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).properties.Supersedes.rich_text[0].text.content).toBe("memory-1")
    expect(fetchMock.mock.calls[2][0]).toContain("/pages/memory-1")
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).properties).toEqual({
      Status: { select: { name: "superseded" } },
      "Superseded By": { rich_text: [{ text: { content: "memory-2" } }] },
      "Superseded At": { date: { start: "2026-08-03T00:00:00.000Z" } },
    })
  })

  it("requires the dedicated Lo Memory database id before writing", async () => {
    delete process.env.NOTION_LO_MEMORY_DB_ID
    await expect(createLoMemory(MEMORY_INPUT)).rejects.toThrow("NOTION_LO_MEMORY_DB_ID")
  })
})
