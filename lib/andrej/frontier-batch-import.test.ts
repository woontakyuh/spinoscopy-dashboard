import { describe, expect, it, vi } from "vitest"

import { AiFrontierAnalysisError } from "@/lib/andrej/frontier-analysis"
import { DwarkeshTranscriptNotReadyError } from "@/lib/andrej/dwarkesh-catalog"
import { notionRequest } from "@/lib/notion/client"
import { AiFrontierPersistenceError } from "@/lib/notion/ai-frontier-import"
import type { AiFrontierIndex } from "@/lib/types/ai-frontier"
import type { AiFrontierEpisodeAnalysis, AiFrontierImportResult, AiFrontierOfficialEpisode } from "@/lib/types/ai-frontier-import"
import {
  importNewDwarkeshBatch,
  importNewestDwarkeshBatch,
  type DwarkeshBatchCandidate,
} from "./frontier-batch-import"

const analysis: AiFrontierEpisodeAnalysis = {
  summary: "한국어 요약",
  topics: ["Alignment"], models: [], people: ["Dwarkesh Patel"],
  concepts: [{
    term: "AI Control", korean: "AI 통제", category: "Safety",
    oneLine: "AI 시스템의 행동을 제한한다.", intuition: "안전 난간과 같다.",
    whyItMatters: "위험한 행동을 줄인다.",
  }],
  keyPoints: [{ heading: "핵심", bullets: ["통제 가능성을 분석한다."] }],
  insights: ["평가와 통제를 함께 설계해야 한다."], mentalModels: ["안전 난간"],
  factInterpretation: ["전사에서 확인된 주장이다."], questions: ["어떤 평가가 충분한가?"],
}

async function notionHttpError(payload: string, status = 400): Promise<Error> {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: false,
    status,
    text: async () => payload,
  })))
  let caught: unknown
  try {
    await notionRequest("/pages/reachable")
  } catch (error) {
    caught = error
  } finally {
    vi.unstubAllGlobals()
  }
  if (!(caught instanceof Error)) throw new Error("Expected Notion HTTP error")
  return caught
}

function candidates(): DwarkeshBatchCandidate[] {
  return Array.from({ length: 10 }, (_, index) => {
    const number = 10 - index
    return {
      pageId: `page-${number}`,
      sourceKey: `DWARKESH:EPISODE-${number}`,
      officialUrl: `https://www.dwarkesh.com/p/episode-${number}`,
      published: `2026-08-${String(number).padStart(2, "0")}`,
    }
  })
}

function official(candidate: DwarkeshBatchCandidate): AiFrontierOfficialEpisode {
  return {
    source: "dwarkesh", reference: candidate.sourceKey, episodeNumber: null,
    name: candidate.sourceKey, officialUrl: candidate.officialUrl,
    published: candidate.published, duration: "PT1H", youtube: null, summary: null,
    transcript: `Transcript for ${candidate.sourceKey}`,
  }
}

function indexFor(rows: DwarkeshBatchCandidate[], completed = new Set<string>()): AiFrontierIndex {
  return {
    status: "ok", sources: { episodes: "ok", concepts: "ok" },
    episodeIndex: Object.fromEntries(rows.map((row) => [row.sourceKey, row.pageId])),
    episodes: rows.map((row) => ({
      id: row.pageId, name: row.sourceKey, episodeNumber: null,
      status: completed.has(row.sourceKey) ? "완료" : "목록",
      published: row.published, recorded: null, reviewed: false,
      topics: [], models: [], people: [], youtube: null,
      transcriptSource: row.officialUrl, duration: "PT1H", summary: null, keyTerms: [],
      source: "dwarkesh", sourceKey: row.sourceKey, sourceIdentityPersisted: true,
    })),
    concepts: [],
  }
}

function dependencies(rows = candidates(), completed = new Set<string>()) {
  const events: string[] = []
  return {
    events,
    loadIndex: vi.fn(async () => indexFor(rows, completed)),
    loadEpisode: vi.fn(async (url: string) => {
      const candidate = rows.find((row) => row.officialUrl === url)
      if (!candidate) throw new Error("unexpected URL")
      events.push(`fetch:${candidate.sourceKey}`)
      return official(candidate)
    }),
    analyze: vi.fn(async (episode: AiFrontierOfficialEpisode) => {
      events.push(`analyze:${episode.reference}`)
      return analysis
    }),
    persist: vi.fn(async (input: {
      pageId: string
      episode: AiFrontierOfficialEpisode
      analysis: AiFrontierEpisodeAnalysis
      existingConcepts: AiFrontierIndex["concepts"]
    }): Promise<AiFrontierImportResult> => {
      events.push(`persist:${input.episode.reference}`)
      return {
        pageId: input.pageId, reference: input.episode.reference,
        episodeNumber: null, status: "완료", conceptsCreated: 1, conceptsUpdated: 0,
      }
    }),
    setStatus: vi.fn(async (pageId: string, status: "목록" | "수집 중" | "수집 실패") => {
      events.push(`status:${pageId}:${status}`)
    }),
  }
}

describe("newest-10 Dwarkesh batch import", () => {
  it("supports one validated future page within the cron duration budget", async () => {
    const rows = candidates().slice(0, 1)
    const deps = dependencies(rows)

    const result = await importNewDwarkeshBatch(rows, deps)

    expect(result.completed).toEqual([rows[0]!.sourceKey])
    expect(deps.loadEpisode).toHaveBeenCalledOnce()
  })

  it.each([2, 3])("rejects a %i-page future batch so remaining pages stay durably pending", async (size) => {
    const rows = candidates().slice(0, size)
    const deps = dependencies(rows)

    await expect(importNewDwarkeshBatch(rows, deps)).rejects.toMatchObject({ code: "future-window" })
    expect(deps.loadIndex).not.toHaveBeenCalled()
    expect(deps.loadEpisode).not.toHaveBeenCalled()
  })

  it("rejects four future pages before index, transcript, provider, or persistence calls", async () => {
    const rows = candidates().slice(0, 4)
    const deps = dependencies(rows)

    await expect(importNewDwarkeshBatch(rows, deps)).rejects.toMatchObject({ code: "future-window" })
    expect(deps.loadIndex).not.toHaveBeenCalled()
    expect(deps.loadEpisode).not.toHaveBeenCalled()
    expect(deps.analyze).not.toHaveBeenCalled()
    expect(deps.persist).not.toHaveBeenCalled()
    expect(deps.setStatus).not.toHaveBeenCalled()
  })

  it("rejects stale recovery when another invocation refreshed the lease first", async () => {
    const rows = [{
      ...candidates()[0]!,
      expectedLastEditedAt: "2026-08-20T11:40:00.000Z",
    }]
    const deps = dependencies(rows)
    deps.loadIndex.mockImplementation(async () => {
      const index = indexFor(rows)
      index.episodes[0] = {
        ...index.episodes[0]!,
        status: "수집 중",
        lastEditedAt: "2026-08-20T11:59:00.000Z",
      }
      return index
    })

    await expect(importNewDwarkeshBatch(rows, deps)).rejects.toMatchObject({
      code: "metadata-mismatch",
    })
    expect(deps.loadEpisode).not.toHaveBeenCalled()
    expect(deps.analyze).not.toHaveBeenCalled()
    expect(deps.setStatus).not.toHaveBeenCalled()
  })

  it("rejects future-window persisted metadata drift before transcript or provider calls", async () => {
    const rows = candidates().slice(0, 1)
    const deps = dependencies(rows)
    deps.loadIndex.mockImplementation(async () => {
      const index = indexFor(rows)
      index.episodes[0] = { ...index.episodes[0]!, published: "2026-01-01" }
      return index
    })

    await expect(importNewDwarkeshBatch(rows, deps)).rejects.toMatchObject({ code: "metadata-mismatch" })
    expect(deps.loadEpisode).not.toHaveBeenCalled()
    expect(deps.analyze).not.toHaveBeenCalled()
    expect(deps.persist).not.toHaveBeenCalled()
    expect(deps.setStatus).not.toHaveBeenCalled()
  })

  it("imports exactly ten sequentially with canonical concept references and stable order", async () => {
    const rows = candidates()
    const deps = dependencies(rows)
    const result = await importNewestDwarkeshBatch(rows, {}, deps)

    expect(result).toEqual({ completed: rows.map(({ sourceKey }) => sourceKey), failed: [], skipped: [] })
    expect(deps.loadEpisode).toHaveBeenCalledTimes(10)
    expect(deps.analyze).toHaveBeenCalledTimes(10)
    expect(deps.persist).toHaveBeenCalledTimes(10)
    expect(deps.persist.mock.calls.map(([input]) => input.episode.reference))
      .toEqual(rows.map(({ sourceKey }) => sourceKey))
    for (const row of rows) {
      expect(deps.events.indexOf(`status:${row.pageId}:수집 중`)).toBeLessThan(deps.events.indexOf(`fetch:${row.sourceKey}`))
      expect(deps.events.indexOf(`fetch:${row.sourceKey}`)).toBeLessThan(deps.events.indexOf(`analyze:${row.sourceKey}`))
      expect(deps.events.indexOf(`analyze:${row.sourceKey}`)).toBeLessThan(deps.events.indexOf(`persist:${row.sourceKey}`))
    }
  })

  it("isolates one transcript failure and completes nine without retries or leaked errors", async () => {
    const rows = candidates()
    const deps = dependencies(rows)
    deps.loadEpisode.mockImplementation(async (url: string) => {
      const candidate = rows.find((row) => row.officialUrl === url)!
      deps.events.push(`fetch:${candidate.sourceKey}`)
      if (candidate === rows[3]) throw new Error("token=not-safe")
      return official(candidate)
    })
    const result = await importNewestDwarkeshBatch(rows, {}, deps)

    expect(result.completed).toEqual(rows.filter((_, index) => index !== 3).map(({ sourceKey }) => sourceKey))
    expect(result.failed).toEqual([expect.objectContaining({
      sourceKey: rows[3]!.sourceKey,
      reason: "transcript",
    })])
    expect(JSON.stringify(result)).not.toContain("token=not-safe")
    expect(deps.loadEpisode).toHaveBeenCalledTimes(10)
    expect(deps.analyze).toHaveBeenCalledTimes(9)
    expect(deps.persist).toHaveBeenCalledTimes(9)
    expect(deps.setStatus).toHaveBeenCalledWith(rows[3]!.pageId, "수집 실패")
  })

  it("future metadata-only episode without transcript returns to 목록 and is skipped without provider cost", async () => {
    const rows = candidates().slice(0, 1)
    const deps = dependencies(rows)
    deps.loadEpisode.mockRejectedValueOnce(new DwarkeshTranscriptNotReadyError())

    const result = await importNewDwarkeshBatch(rows, deps)

    expect(result).toEqual({ completed: [], failed: [], skipped: [rows[0]!.sourceKey] })
    expect(deps.setStatus).toHaveBeenNthCalledWith(1, rows[0]!.pageId, "수집 중")
    expect(deps.setStatus).toHaveBeenNthCalledWith(2, rows[0]!.pageId, "목록")
    expect(deps.analyze).not.toHaveBeenCalled()
    expect(deps.persist).not.toHaveBeenCalled()
  })

  it("skips completed pages without fetch, analysis, persistence, or status cost", async () => {
    const rows = candidates()
    const skipped = rows[4]!
    const deps = dependencies(rows, new Set([skipped.sourceKey]))
    const result = await importNewestDwarkeshBatch(rows, {}, deps)

    expect(result.skipped).toEqual([skipped.sourceKey])
    expect(deps.loadEpisode).not.toHaveBeenCalledWith(skipped.officialUrl)
    expect(deps.analyze.mock.calls.some(([episode]) => episode.reference === skipped.sourceKey)).toBe(false)
    expect(deps.persist.mock.calls.some(([input]) => input.pageId === skipped.pageId)).toBe(false)
    expect(deps.setStatus.mock.calls.some(([pageId]) => pageId === skipped.pageId)).toBe(false)
  })

  it("imports a completed page when force=true", async () => {
    const rows = candidates()
    const forced = rows[4]!
    const deps = dependencies(rows, new Set([forced.sourceKey]))
    const result = await importNewestDwarkeshBatch(rows, { force: true }, deps)

    expect(result.completed).toContain(forced.sourceKey)
    expect(result.skipped).toEqual([])
    expect(deps.loadEpisode).toHaveBeenCalledWith(forced.officialUrl)
  })

  it("isolates late metadata drift to the current candidate", async () => {
    const rows = candidates()
    const deps = dependencies(rows)
    let indexLoads = 0
    deps.loadIndex.mockImplementation(async () => {
      indexLoads += 1
      const index = indexFor(rows)
      if (indexLoads >= 5) {
        index.episodes[9] = { ...index.episodes[9]!, sourceKey: "DWARKESH:DRIFTED" }
      }
      return index
    })

    const result = await importNewestDwarkeshBatch(rows, {}, deps)

    expect(result.completed).toEqual(rows.slice(0, 9).map(({ sourceKey }) => sourceKey))
    expect(result.failed).toEqual([expect.objectContaining({
      sourceKey: rows[9]!.sourceKey,
      reason: "metadata-drift",
    })])
    expect(deps.loadEpisode).not.toHaveBeenCalledWith(rows[9]!.officialUrl)
    expect(deps.analyze.mock.calls.some(([episode]) => episode.reference === rows[9]!.sourceKey)).toBe(false)
    expect(deps.persist.mock.calls.some(([input]) => input.pageId === rows[9]!.pageId)).toBe(false)
    expect(deps.setStatus.mock.calls.some(([pageId]) => pageId === rows[9]!.pageId)).toBe(false)
  })

  it.each([
    ["undersized", (rows: DwarkeshBatchCandidate[]) => rows.slice(0, 9), "exact-window"],
    ["oversized", (rows: DwarkeshBatchCandidate[]) => [...rows, { ...rows[9]!, pageId: "page-11", sourceKey: "DWARKESH:EPISODE-11", officialUrl: "https://www.dwarkesh.com/p/episode-11" }], "exact-window"],
    ["duplicate", (rows: DwarkeshBatchCandidate[]) => rows.map((row, index) => index === 9 ? { ...row, sourceKey: rows[0]!.sourceKey, officialUrl: rows[0]!.officialUrl } : row), "duplicate-source-key"],
    ["malformed", (rows: DwarkeshBatchCandidate[]) => rows.map((row, index) => index === 0 ? { ...row, sourceKey: "dwarkesh:not canonical" } : row), "invalid-candidate"],
    ["wrong source", (rows: DwarkeshBatchCandidate[]) => rows.map((row, index) => index === 0 ? { ...row, sourceKey: "EP110", officialUrl: "https://aifrontier.kr/ko/episodes/ep110" } : row), "invalid-candidate"],
    ["out-of-order", (rows: DwarkeshBatchCandidate[]) => rows.map((row, index) => index === 1 ? { ...row, published: "2026-08-11" } : row), "invalid-candidate"],
  ] as const)("rejects %s candidates before any dependency call", async (_name, mutate, code) => {
    const rows = candidates()
    const deps = dependencies(rows)
    const promise = importNewestDwarkeshBatch(mutate(rows), {}, deps)

    await expect(promise).rejects.toMatchObject({ code })
    expect(deps.loadIndex).not.toHaveBeenCalled()
    expect(deps.loadEpisode).not.toHaveBeenCalled()
    expect(deps.analyze).not.toHaveBeenCalled()
    expect(deps.persist).not.toHaveBeenCalled()
    expect(deps.setStatus).not.toHaveBeenCalled()
  })

  it("classifies provider and Notion partial failures and preserves ordered buckets", async () => {
    const rows = candidates()
    const deps = dependencies(rows)
    deps.analyze.mockImplementation(async (episode) => {
      if (episode.reference === rows[1]!.sourceKey) throw new Error("Bearer secret-analysis")
      return analysis
    })
    deps.persist.mockImplementation(async (input) => {
      if (input.episode.reference === rows[6]!.sourceKey) throw new Error("secret-notion")
      return {
        pageId: input.pageId, reference: input.episode.reference, episodeNumber: null,
        status: "완료", conceptsCreated: 1, conceptsUpdated: 0,
      }
    })
    const result = await importNewestDwarkeshBatch(rows, {}, deps)

    expect(result.failed).toEqual([
      expect.objectContaining({ sourceKey: rows[1]!.sourceKey, reason: "analysis" }),
      expect.objectContaining({ sourceKey: rows[6]!.sourceKey, reason: "persistence" }),
    ])
    expect(result.completed).toEqual(rows.filter((_, index) => index !== 1 && index !== 6).map(({ sourceKey }) => sourceKey))
    expect(JSON.stringify(result)).not.toMatch(/secret|Bearer/)
    expect(deps.loadEpisode).toHaveBeenCalledTimes(10)
  })

  it.each([
    ["notion-read", "notion-read"],
    ["status", "status"],
    ["transcript", "transcript"],
    ["analysis", "analysis"],
    ["persistence", "persistence"],
  ] as const)("keeps a useful redacted diagnostic for %s failures", async (phase, reason) => {
    const rows = candidates()
    const deps = dependencies(rows)
    class UpstreamDiagnosticError extends Error {
      override name = "UpstreamDiagnosticError"
    }
    const failure = () => new UpstreamDiagnosticError(
      "upstream unavailable token=top-secret response body: {\"authorization\":\"Bearer body-secret\"}\nraw-body-line"
    )
    if (phase === "notion-read") {
      let loads = 0
      deps.loadIndex.mockImplementation(async () => {
        loads += 1
        if (loads === 2) throw failure()
        return indexFor(rows)
      })
    } else if (phase === "status") {
      deps.setStatus.mockImplementationOnce(async () => { throw failure() })
    } else if (phase === "transcript") {
      deps.loadEpisode.mockImplementationOnce(async () => { throw failure() })
    } else if (phase === "analysis") {
      deps.analyze.mockImplementationOnce(async () => { throw failure() })
    } else {
      deps.persist.mockImplementationOnce(async () => { throw failure() })
    }

    const result = await importNewestDwarkeshBatch(rows, {}, deps)

    expect(result.failed[0]).toMatchObject({
      sourceKey: rows[0]!.sourceKey,
      reason,
      detail: {
        name: "UpstreamError",
        message: "Upstream operation failed.",
      },
    })
    expect(JSON.stringify(result)).not.toMatch(/top-secret|body-secret|authorization|raw-body-line/i)
  })

  it("propagates typed secret-safe analysis diagnostics", async () => {
    const rows = candidates()
    const deps = dependencies(rows)
    deps.analyze.mockImplementationOnce(async () => {
      throw new AiFrontierAnalysisError("http", 429, true)
    })

    const result = await importNewestDwarkeshBatch(rows, {}, deps)

    expect(result.failed[0]).toMatchObject({
      sourceKey: rows[0]!.sourceKey,
      reason: "analysis",
      detail: {
        name: "AiFrontierAnalysisError",
        message: "AI Frontier Episode 분석에 실패했습니다.",
        phase: "http",
        status: 429,
        retryable: true,
      },
    })
  })

  it("propagates typed secret-safe persistence stage diagnostics", async () => {
    const rows = candidates()
    const deps = dependencies(rows)
    deps.persist.mockImplementationOnce(async () => {
      throw new AiFrontierPersistenceError("episode-properties", 400)
    })

    const result = await importNewestDwarkeshBatch(rows, {}, deps)

    expect(result.failed[0]).toMatchObject({
      sourceKey: rows[0]!.sourceKey,
      reason: "persistence",
      detail: {
        name: "AiFrontierPersistenceError",
        message: "AI Frontier Notion 저장에 실패했습니다.",
        stage: "episode-properties",
        status: 400,
      },
    })
  })

  it("reports a failed failure-status write without hiding the original typed phase", async () => {
    const rows = candidates()
    const deps = dependencies(rows)
    deps.analyze.mockImplementation(async (episode) => {
      if (episode.reference === rows[2]!.sourceKey) throw new Error("provider credential sentinel")
      return analysis
    })
    deps.setStatus.mockImplementation(async (pageId, status) => {
      if (pageId === rows[2]!.pageId && status === "수집 실패") {
        throw new Error("Notion credential sentinel")
      }
    })

    const result = await importNewestDwarkeshBatch(rows, {}, deps)

    expect(result.failed).toEqual([expect.objectContaining({
      sourceKey: rows[2]!.sourceKey,
      reason: "analysis",
      statusUpdateFailed: true,
      detail: { name: "UpstreamError", message: "Upstream operation failed." },
      statusDetail: { name: "UpstreamError", message: "Upstream operation failed." },
    })])
    expect(result.completed).toHaveLength(9)
    expect(JSON.stringify(result)).not.toContain("credential sentinel")
  })

  it("redacts the complete exact notionRequest JSON response body from batch diagnostics", async () => {
    const rows = candidates()
    const deps = dependencies(rows)
    const payload = JSON.stringify({
      object: "error",
      api_key: "sk-batch-secret",
      token: "token_batch_secret",
      authorization: "Token quoted-batch-secret",
    })
    const clientError = await notionHttpError(payload, 429)
    expect(clientError.message).toBe("Notion API request failed.")
    deps.loadEpisode.mockImplementationOnce(async () => { throw clientError })

    const result = await importNewestDwarkeshBatch(rows, {}, deps)

    expect(result.failed[0]?.detail).toEqual({
      name: "NotionRequestError",
      message: "Notion API request failed.",
      status: 429,
    })
    expect(JSON.stringify(result.failed[0])).not.toMatch(
      /sk-batch-secret|token_batch_secret|quoted-batch-secret|api_key|authorization/
    )
  })

  it.each([
    ["Basic", "dXNlcjpwYXNzPT0="],
    ["Token", "token-value.trailing"],
    ["Digest", "digest-value.trailing"],
    ["Bearer", "bearer-value.trailing"],
  ])("redacts the complete Authorization: %s credential from batch diagnostics", async (scheme, credential) => {
    const rows = candidates()
    const deps = dependencies(rows)
    class CredentialDiagnosticError extends Error {
      override name = "CredentialDiagnosticError"
    }
    deps.loadEpisode.mockImplementationOnce(async () => {
      throw new CredentialDiagnosticError(
        `upstream Authorization: ${scheme} ${credential} safe-marker\nunsafe-second-line`
      )
    })

    const result = await importNewestDwarkeshBatch(rows, {}, deps)

    expect(result.failed[0]?.detail).toEqual({
      name: "UpstreamError",
      message: "Upstream operation failed.",
    })
    expect(JSON.stringify(result.failed[0])).not.toContain(credential)
    expect(JSON.stringify(result.failed[0])).not.toContain("unsafe-second-line")
  })

  it("redacts entropy-shaped provider tokens and key query values", async () => {
    const rows = candidates()
    const deps = dependencies(rows)
    deps.loadEpisode.mockImplementationOnce(async () => {
      throw new Error("fetch failed sk-abcdefghijklmnopqrstuvwxyz ntn_1234567890abcdef token_abcdef1234567890 https://upstream.test/x?key=query-secret&safe=1")
    })

    const result = await importNewestDwarkeshBatch(rows, {}, deps)
    const serialized = JSON.stringify(result.failed[0])

    expect(serialized).toContain("Upstream operation failed.")
    expect(serialized).not.toMatch(/abcdefghijklmnopqrstuvwxyz|1234567890abcdef|abcdef1234567890|query-secret/)
    expect(serialized).not.toContain("upstream.test")
  })

  it("does not start a later page until the current provider operation settles", async () => {
    const rows = candidates()
    const deps = dependencies(rows)
    let releaseFirst: (() => void) | undefined
    let signalFirstStarted: (() => void) | undefined
    const firstSettled = new Promise<void>((resolve) => { releaseFirst = resolve })
    const firstStarted = new Promise<void>((resolve) => { signalFirstStarted = resolve })
    deps.analyze.mockImplementation(async (episode) => {
      if (episode.reference === rows[0]!.sourceKey) {
        signalFirstStarted!()
        await firstSettled
      }
      return analysis
    })

    const running = importNewestDwarkeshBatch(rows, {}, deps)
    await firstStarted
    expect(deps.analyze).toHaveBeenCalledTimes(1)
    expect(deps.loadEpisode).toHaveBeenCalledTimes(1)
    releaseFirst!()
    const result = await running

    expect(result.completed).toEqual(rows.map(({ sourceKey }) => sourceKey))
    expect(deps.loadEpisode).toHaveBeenCalledTimes(10)
  })
})
