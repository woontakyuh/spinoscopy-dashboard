import { describe, expect, it, vi } from "vitest"

import type { AiFrontierEpisode, AiFrontierIndex } from "@/lib/types/ai-frontier"
import type {
  AiFrontierCatalogEpisode,
  AiFrontierOfficialEpisode,
} from "@/lib/types/ai-frontier-import"
import {
  parseAiFrontierBackfillArgs,
  planAiFrontierBackfillPreview,
  runAiFrontierBackfillPreview,
  type AiFrontierBackfillApplyDependencies,
  type AiFrontierBackfillPreviewDependencies,
  type AiFrontierBackfillTranscriptResult,
} from "./ai-frontier-backfill-preview"

function dwarkesh(index: number, overrides: Partial<AiFrontierCatalogEpisode> = {}): AiFrontierCatalogEpisode {
  const slug = `episode-${String(index).padStart(2, "0")}`
  return {
    source: "dwarkesh", reference: `DWARKESH:${slug.toUpperCase()}`, episodeNumber: null,
    name: `Episode ${index} <untrusted>`, officialUrl: `https://www.dwarkesh.com/p/${slug}`,
    published: `2026-07-${String(index).padStart(2, "0")}`, duration: "PT1H",
    youtube: null, summary: `Summary ${index}`, ...overrides,
  }
}

function episode(overrides: Partial<AiFrontierEpisode> = {}): AiFrontierEpisode {
  return {
    id: "page-1", name: "EP1. Existing", episodeNumber: 1, status: "완료",
    published: "2026-01-01", recorded: null, reviewed: false, topics: [], models: [],
    people: [], youtube: null, transcriptSource: "https://aifrontier.kr/ko/episodes/ep1",
    duration: null, summary: "keep", keyTerms: [], source: "ai-frontier", sourceKey: "EP1",
    sourceIdentityPersisted: false, ...overrides,
  }
}

function official(row: AiFrontierCatalogEpisode): AiFrontierOfficialEpisode {
  return { ...row, transcript: `Full transcript for ${row.reference}` }
}

const schema = {
  mode: "dryRun" as const, databaseId: "fixture-db",
  planned: [
    { property: "Source" as const, expectedType: "select" as const },
    { property: "Source Key" as const, expectedType: "rich_text" as const },
  ],
  applied: [], unchanged: [], conflicts: [], writes: 0,
}

function transcriptResults(
  catalog: readonly AiFrontierCatalogEpisode[],
  missing = new Set<string>()
): AiFrontierBackfillTranscriptResult[] {
  return catalog
    .filter((row) => row.source === "dwarkesh")
    .sort((left, right) => (right.published ?? "").localeCompare(left.published ?? ""))
    .slice(0, 20)
    .map((row) => ({ sourceKey: row.reference, status: missing.has(row.reference) ? "missing" : "ready" }))
}

function appliedIndex(catalog: readonly AiFrontierCatalogEpisode[]): AiFrontierIndex {
  const episodes = catalog.slice(0, 20).map((row, index) => episode({
    id: `page-${index}`, name: row.name, episodeNumber: null, status: "목록",
    published: row.published, transcriptSource: row.officialUrl, duration: row.duration,
    source: "dwarkesh", sourceKey: row.reference, sourceIdentityPersisted: true,
  }))
  return {
    status: "ok", sources: { episodes: "ok", concepts: "ok" }, episodes, concepts: [],
    episodeIndex: Object.fromEntries(episodes.map((row) => [row.sourceKey ?? "", row.id])),
  }
}

function dependencies(catalog: AiFrontierCatalogEpisode[]): AiFrontierBackfillPreviewDependencies {
  return {
    loadSchemaPreview: vi.fn(async () => schema),
    loadCatalog: vi.fn(async () => catalog),
    loadExistingEpisodes: vi.fn(async () => []),
    loadTranscript: vi.fn(async (row) => official(row)),
    apply: {
      migrateSchema: vi.fn(async () => ({ ...schema, mode: "apply" as const, applied: schema.planned, writes: 1 })),
      syncCatalog: vi.fn(async () => ({ created: 20, updated: 0, unchanged: 0, createdPages: [] })),
      loadIndex: vi.fn(async () => appliedIndex(catalog)),
      importSummaries: vi.fn(async () => ({ completed: [], failed: [], skipped: [] })),
    },
  }
}

describe("parseAiFrontierBackfillArgs", () => {
  it.each([
    [[], "mode-required"],
    [["--dry-run", "--apply"], "mode-ambiguous"],
    [["--dry-run", "--wat"], "unknown-flag"],
    [["--dry-run", "--dry-run"], "mode-ambiguous"],
  ])("fails closed for argv=%j", (argv, code) => {
    expect(() => parseAiFrontierBackfillArgs(argv)).toThrowError(expect.objectContaining({ code }))
  })

  it("accepts exactly one mode", () => {
    expect(parseAiFrontierBackfillArgs(["--dry-run"])).toEqual({ mode: "dryRun" })
    expect(parseAiFrontierBackfillArgs(["--apply"])).toEqual({ mode: "apply" })
  })
})

describe("planAiFrontierBackfillPreview", () => {
  it("selects the newest ten transcript-ready rows inside the newest twenty metadata rows", () => {
    const catalog = Array.from({ length: 22 }, (_, offset) => dwarkesh(offset + 1)).reverse()
    const missing = new Set(["DWARKESH:EPISODE-22", "DWARKESH:EPISODE-19"])

    const result = planAiFrontierBackfillPreview({
      mode: "dryRun", schema, catalog, existingEpisodes: [],
      transcripts: transcriptResults(catalog, missing),
    })

    expect(result.metadata.map(({ sourceKey }) => sourceKey)).toHaveLength(20)
    expect(result.transcripts).toEqual({
      checked: 20,
      ready: { count: 18, sourceKeys: expect.not.arrayContaining([...missing]) },
      missing: { count: 2, sourceKeys: ["DWARKESH:EPISODE-22", "DWARKESH:EPISODE-19"] },
    })
    expect(result.summaryCandidates.map(({ sourceKey }) => sourceKey)).toEqual([
      "DWARKESH:EPISODE-21", "DWARKESH:EPISODE-20", "DWARKESH:EPISODE-18",
      "DWARKESH:EPISODE-17", "DWARKESH:EPISODE-16", "DWARKESH:EPISODE-15",
      "DWARKESH:EPISODE-14", "DWARKESH:EPISODE-13", "DWARKESH:EPISODE-12",
      "DWARKESH:EPISODE-11",
    ])
    expect(result.deletes).toBe(0)
    expect(JSON.stringify(result)).not.toContain("<untrusted>")
  })

  it("fails closed when fewer than ten rows have validated transcripts", () => {
    const catalog = Array.from({ length: 20 }, (_, offset) => dwarkesh(offset + 1))
    const ready = new Set(catalog.slice(0, 9).map((row) => row.reference))
    const transcripts = catalog.map((row) => ({
      sourceKey: row.reference,
      status: ready.has(row.reference) ? "ready" as const : "missing" as const,
    }))

    expect(() => planAiFrontierBackfillPreview({
      mode: "dryRun", schema, catalog, existingEpisodes: [], transcripts,
    })).toThrowError(expect.objectContaining({ code: "undersized-transcript-window" }))
  })
})

describe("runAiFrontierBackfillPreview", () => {
  it("dry-run fetches and validates all twenty transcripts without any apply boundary call", async () => {
    const catalog = Array.from({ length: 20 }, (_, offset) => dwarkesh(offset + 1))
    const deps = dependencies(catalog)

    const result = await runAiFrontierBackfillPreview({ mode: "dryRun" }, deps)

    expect(deps.loadTranscript).toHaveBeenCalledTimes(20)
    expect(result.transcripts).toMatchObject({ checked: 20, ready: { count: 20 }, missing: { count: 0 } })
    expect(result.execution).toBeNull()
    expect(deps.apply.migrateSchema).not.toHaveBeenCalled()
    expect(deps.apply.syncCatalog).not.toHaveBeenCalled()
    expect(deps.apply.importSummaries).not.toHaveBeenCalled()
  })

  it("fails closed on a transcript transport error instead of reporting it as transcript-less", async () => {
    const catalog = Array.from({ length: 20 }, (_, offset) => dwarkesh(offset + 1))
    const deps = dependencies(catalog)
    deps.loadTranscript = vi.fn(async (row) => {
      if (row.reference === "DWARKESH:EPISODE-20") throw new Error("transport failed")
      return official(row)
    })

    await expect(runAiFrontierBackfillPreview({ mode: "dryRun" }, deps))
      .rejects.toMatchObject({ code: "transcript-audit-failed" })
    expect(deps.loadTranscript).toHaveBeenCalledTimes(20)
    expect(deps.apply.migrateSchema).not.toHaveBeenCalled()
  })

  it("apply composes schema, catalog identity sync, reload, and exact summary import once", async () => {
    const catalog = Array.from({ length: 20 }, (_, offset) => dwarkesh(offset + 1)).reverse()
    const deps = dependencies(catalog)
    const importSummaries = vi.fn<AiFrontierBackfillApplyDependencies["importSummaries"]>(
      async (candidates) => ({
        completed: candidates.slice(0, 8).map(({ sourceKey }) => sourceKey),
        failed: [{
          sourceKey: candidates[8]?.sourceKey ?? "missing",
          reason: "analysis" as const,
          detail: { name: "ProviderError", message: "failed" },
        }],
        skipped: [candidates[9]?.sourceKey ?? "missing"],
      })
    )
    deps.apply.importSummaries = importSummaries

    const result = await runAiFrontierBackfillPreview({ mode: "apply" }, deps)

    expect(deps.apply.migrateSchema).toHaveBeenCalledOnce()
    expect(deps.apply.syncCatalog).toHaveBeenCalledOnce()
    expect(deps.apply.loadIndex).toHaveBeenCalledOnce()
    expect(deps.apply.importSummaries).toHaveBeenCalledOnce()
    const imported = importSummaries.mock.calls[0]?.[0]
    expect(imported?.map(({ sourceKey }) => sourceKey)).toEqual(
      result.summaryCandidates.map(({ sourceKey }) => sourceKey)
    )
    expect(result.execution).toEqual({
      schema: { writes: 1, applied: 2 },
      catalog: { created: 20, updated: 0, unchanged: 0 },
      summaries: { completed: 8, failed: 1, skipped: 1, analysisCalls: 9 },
    })
    expect(result.deletes).toBe(0)
  })

  it("schema preview conflicts stop apply and transcript/provider writes", async () => {
    const catalog = Array.from({ length: 20 }, (_, offset) => dwarkesh(offset + 1))
    const deps = dependencies(catalog)
    deps.loadSchemaPreview = vi.fn(async () => ({
      ...schema, planned: [],
      conflicts: [{ property: "Source" as const, expectedType: "select" as const, actualType: "rich_text" }],
    }))

    await expect(runAiFrontierBackfillPreview({ mode: "apply" }, deps))
      .rejects.toMatchObject({ code: "schema-conflict" })
    expect(deps.apply.migrateSchema).not.toHaveBeenCalled()
    expect(deps.apply.syncCatalog).not.toHaveBeenCalled()
    expect(deps.apply.importSummaries).not.toHaveBeenCalled()
  })
})
