import { describe, expect, it } from "vitest"
import {
  buildWikiSnapshotRows,
  computeWikiStaleDays,
  detectSourceMismatch,
  formatKinds,
  formatLayers,
  newestEventIndex,
  parseWikiState,
  type WikiPageEntry,
  type WikiStateFile,
} from "./wikiState"

function page(over: Partial<WikiPageEntry> = {}): WikiPageEntry {
  return {
    source_path: "/vault/x.md",
    source_sha256: "abc",
    content_sha256: "def",
    created_at: "2026-07-15T23:29:24Z",
    kind: "core_notes",
    layer: "Core",
    ...over,
  }
}

function fixtureState(over: Partial<WikiStateFile> = {}): WikiStateFile {
  const pages: Record<string, WikiPageEntry> = {}
  for (let i = 0; i < 17; i++) pages[`core/notes/n${i}.md`] = page({ kind: "core_notes", layer: "Core" })
  for (let i = 0; i < 6; i++) pages[`core/agent_os/a${i}.md`] = page({ kind: "core_agent_os", layer: "Core" })
  for (let i = 0; i < 5; i++) pages[`core/strategy/s${i}.md`] = page({ kind: "core_strategy", layer: "Core" })
  for (let i = 0; i < 3; i++) pages[`research/projects/r${i}.md`] = page({ kind: "research_projects", layer: "Research Graph" })

  const inputs: WikiStateFile["inputs"] = {}
  for (const key of Object.keys(pages)) inputs[`/vault/${key}`] = { sha256: "abc", kind: pages[key].kind }

  return {
    schema_version: 3,
    compiler_version: "3.0.0",
    inputs,
    pages,
    events: [
      {
        at: "2026-07-15T23:29:24Z",
        status: "changed",
        created: Object.keys(pages),
        updated: [],
        deleted: [],
      },
    ],
    ...over,
  }
}

describe("parseWikiState", () => {
  it("parses a well-formed file", () => {
    const state = parseWikiState(fixtureState())
    expect(state.compiler_version).toBe("3.0.0")
    expect(Object.keys(state.pages)).toHaveLength(31)
  })

  it("throws when the top level isn't an object", () => {
    expect(() => parseWikiState(null)).toThrow(/객체/)
    expect(() => parseWikiState("nope")).toThrow(/객체/)
  })

  it("throws when compiler_version is missing", () => {
    const raw = fixtureState() as unknown as Record<string, unknown>
    delete raw.compiler_version
    expect(() => parseWikiState(raw)).toThrow(/compiler_version/)
  })

  it("throws when events isn't an array", () => {
    const raw = fixtureState() as unknown as Record<string, unknown>
    raw.events = "nope"
    expect(() => parseWikiState(raw)).toThrow(/events/)
  })

  it("throws when pages is missing", () => {
    const raw = fixtureState() as unknown as Record<string, unknown>
    delete raw.pages
    expect(() => parseWikiState(raw)).toThrow(/pages/)
  })
})

describe("formatLayers / formatKinds", () => {
  it("formats layer counts sorted descending, joined with 가운뎃점", () => {
    const state = fixtureState()
    expect(formatLayers(state.pages)).toBe("Core 28 · Research Graph 3")
  })

  it("formats kind counts sorted descending", () => {
    const state = fixtureState()
    expect(formatKinds(state.pages)).toBe("core_notes 17 · core_agent_os 6 · core_strategy 5 · research_projects 3")
  })

  it("breaks ties alphabetically by name", () => {
    const pages: Record<string, WikiPageEntry> = {
      a: page({ kind: "b_kind", layer: "L" }),
      b: page({ kind: "a_kind", layer: "L" }),
    }
    expect(formatKinds(pages)).toBe("a_kind 1 · b_kind 1")
  })

  it("returns an empty string for no pages", () => {
    expect(formatLayers({})).toBe("")
  })
})

describe("detectSourceMismatch", () => {
  it("reports no mismatch when sources equal pages", () => {
    const result = detectSourceMismatch(31, 31)
    expect(result.mismatched).toBe(false)
    expect(result.label).toBe("소스 31 → 페이지 31 (누락 없음)")
  })

  it("reports a mismatch when sources exceed pages", () => {
    const result = detectSourceMismatch(31, 29)
    expect(result.mismatched).toBe(true)
    expect(result.label).toBe("소스 31 → 페이지 29 · 2건 누락")
  })

  it("reports a mismatch (absolute) when pages exceed sources", () => {
    const result = detectSourceMismatch(29, 31)
    expect(result.mismatched).toBe(true)
    expect(result.label).toBe("소스 29 → 페이지 31 · 2건 누락")
  })
})

describe("computeWikiStaleDays", () => {
  it("reuses the ledger's KST whole-day stall computation", () => {
    // Event at is UTC 23:29:24 on 07-15, which is KST 08:29 on 07-16.
    // now is 2026-08-02 in KST -> 17 whole KST-calendar days since 07-16.
    const now = new Date("2026-08-02T04:00:00.000Z") // 2026-08-02T13:00 KST
    expect(computeWikiStaleDays("2026-07-15T23:29:24Z", now)).toBe(17)
  })

  it("returns 0 for the same KST calendar day", () => {
    const now = new Date("2026-07-16T10:00:00+09:00")
    expect(computeWikiStaleDays("2026-07-16T01:00:00+09:00", now)).toBe(0)
  })
})

describe("newestEventIndex", () => {
  it("returns -1 for no events", () => {
    expect(newestEventIndex([])).toBe(-1)
  })

  it("picks the event with the latest `at`, regardless of array order", () => {
    const events = [
      { at: "2026-07-01T00:00:00Z", status: "changed" as const, created: [], updated: [], deleted: [] },
      { at: "2026-07-20T00:00:00Z", status: "changed" as const, created: [], updated: [], deleted: [] },
      { at: "2026-07-10T00:00:00Z", status: "unchanged" as const, created: [], updated: [], deleted: [] },
    ]
    expect(newestEventIndex(events)).toBe(1)
  })
})

describe("buildWikiSnapshotRows", () => {
  it("stamps current totals only on the newest event's row", () => {
    const state = fixtureState({
      events: [
        {
          at: "2026-07-01T00:00:00Z",
          status: "changed",
          created: ["a.md", "b.md"],
          updated: [],
          deleted: [],
        },
        {
          at: "2026-07-15T23:29:24Z",
          status: "changed",
          created: Object.keys(fixtureState().pages),
          updated: [],
          deleted: [],
        },
      ],
    })
    const rows = buildWikiSnapshotRows(state)
    expect(rows).toHaveLength(2)

    expect(rows[0].eventKey).toBe("2026-07-01T00:00:00Z")
    expect(rows[0].created).toBe(2)
    expect(rows[0].totalPages).toBeNull()
    expect(rows[0].totalSources).toBeNull()
    expect(rows[0].layers).toBeNull()
    expect(rows[0].kinds).toBeNull()
    expect(rows[0].compiler).toBeNull()

    expect(rows[1].eventKey).toBe("2026-07-15T23:29:24Z")
    expect(rows[1].totalPages).toBe(31)
    expect(rows[1].totalSources).toBe(31)
    expect(rows[1].layers).toBe("Core 28 · Research Graph 3")
    expect(rows[1].kinds).toBe("core_notes 17 · core_agent_os 6 · core_strategy 5 · research_projects 3")
    expect(rows[1].compiler).toBe("3.0.0")
  })

  it("counts created/updated/deleted from each event's arrays", () => {
    const state = fixtureState({
      events: [
        {
          at: "2026-07-15T23:29:24Z",
          status: "changed",
          created: ["a.md", "b.md", "c.md"],
          updated: ["d.md"],
          deleted: ["e.md", "f.md"],
        },
      ],
    })
    const rows = buildWikiSnapshotRows(state)
    expect(rows[0].created).toBe(3)
    expect(rows[0].updated).toBe(1)
    expect(rows[0].deleted).toBe(2)
    expect(rows[0].status).toBe("changed")
  })

  it("returns an empty array when there are no events", () => {
    const state = fixtureState({ events: [] })
    expect(buildWikiSnapshotRows(state)).toEqual([])
  })
})
