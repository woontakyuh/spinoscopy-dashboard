import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { DwarkeshBatchCandidate } from "@/lib/andrej/frontier-batch-import"
import { notionRequest } from "@/lib/notion/client"

import {
  createAiFrontierCronHandler as createRouteHandler,
  maxDuration,
  selectAutomaticDwarkeshCandidates,
} from "./route"

const originalCronSecret = process.env.CRON_SECRET
const authorizedRequest = () => new NextRequest(
  "http://localhost/api/cron/ai-frontier",
  { headers: { Authorization: "Bearer cron-secret" } }
)
const catalogResult = {
  catalog: 109,
  created: 0,
  updated: 1,
  unchanged: 108,
  createdPages: [],
}
const noRecovery = {
  loadIndex: vi.fn(async () => ({
    status: "ok" as const,
    sources: { episodes: "ok" as const, concepts: "ok" as const },
    episodes: [], concepts: [], episodeIndex: {},
  })),
  now: () => new Date("2026-08-20T12:00:00.000Z"),
}
const createAiFrontierCronHandler = (
  runSync: Parameters<typeof createRouteHandler>[0],
  runImport: Parameters<typeof createRouteHandler>[1]
) => createRouteHandler(runSync, runImport, noRecovery)

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

function createdPage(number: number, source: "ai-frontier" | "dwarkesh" = "dwarkesh") {
  const date = `2026-08-${String(number % 28 || 28).padStart(2, "0")}`
  return source === "dwarkesh"
    ? {
        pageId: `page-${number}`,
        source,
        sourceKey: `DWARKESH:EPISODE-${number}`,
        published: date,
        officialUrl: `https://www.dwarkesh.com/p/episode-${number}`,
      }
    : {
        pageId: `ai-page-${number}`,
        source,
        sourceKey: `EP${number}`,
        published: date,
        officialUrl: `https://aifrontier.kr/ko/episodes/ep${number}`,
      }
}

afterEach(() => {
  if (originalCronSecret === undefined) {
    delete process.env.CRON_SECRET
  } else {
    process.env.CRON_SECRET = originalCronSecret
  }
})

describe("AI Frontier cron", () => {
  it("declares the platform-safe 300-second duration contract", () => {
    expect(maxDuration).toBe(300)
  })

  it("CRON_SECRET 인증이 없으면 동기화를 실행하지 않는다", async () => {
    process.env.CRON_SECRET = "cron-secret"
    const runSync = vi.fn(async () => catalogResult)
    const runImport = vi.fn()
    const handler = createAiFrontierCronHandler(runSync, runImport)

    const response = await handler(new NextRequest("http://localhost/api/cron/ai-frontier"))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
    expect(runSync).not.toHaveBeenCalled()
    expect(runImport).not.toHaveBeenCalled()
  })

  it("wrong bearer authorization preserves the existing 401 boundary", async () => {
    process.env.CRON_SECRET = "cron-secret"
    const runSync = vi.fn(async () => catalogResult)
    const runImport = vi.fn()
    const handler = createAiFrontierCronHandler(runSync, runImport)

    const response = await handler(new NextRequest(
      "http://localhost/api/cron/ai-frontier",
      { headers: { Authorization: "Bearer wrong-secret" } }
    ))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
    expect(runSync).not.toHaveBeenCalled()
    expect(runImport).not.toHaveBeenCalled()
  })

  it("zero creates performs catalog sync only and zero imports", async () => {
    process.env.CRON_SECRET = "cron-secret"
    const runSync = vi.fn(async () => catalogResult)
    const runImport = vi.fn()
    const response = await createAiFrontierCronHandler(runSync, runImport)(authorizedRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      catalog: { total: 109, created: 0, updated: 1, unchanged: 108 },
      import: {
        counts: { completed: 0, failed: 0, skipped: 0 },
        completed: [], failed: [], skipped: [],
      },
    })
    expect(runSync).toHaveBeenCalledOnce()
    expect(runImport).not.toHaveBeenCalled()
  })

  it("imports one newly created Dwarkesh page in the same run", async () => {
    process.env.CRON_SECRET = "cron-secret"
    const page = createdPage(19)
    const runSync = vi.fn(async () => ({
      ...catalogResult, created: 1, unchanged: 107, createdPages: [page],
    }))
    const runImport = vi.fn(async () => ({
      completed: [page.sourceKey], failed: [], skipped: [],
    }))
    const response = await createAiFrontierCronHandler(runSync, runImport)(authorizedRequest())

    expect(response.status).toBe(200)
    expect(runImport).toHaveBeenCalledWith([{
      pageId: page.pageId,
      sourceKey: page.sourceKey,
      officialUrl: page.officialUrl,
      published: page.published,
    }])
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      import: { completed: [page.sourceKey], failed: [], skipped: [] },
    })
  })

  it("maps an import failure to non-success while retaining safe catalog and import buckets", async () => {
    process.env.CRON_SECRET = "cron-secret"
    const page = createdPage(18)
    const runSync = vi.fn(async () => ({
      ...catalogResult, created: 1, unchanged: 107, createdPages: [page],
    }))
    const runImport = vi.fn(async () => ({
      completed: [],
      failed: [{
        sourceKey: page.sourceKey,
        reason: "analysis" as const,
        detail: { name: "ProviderError", message: "provider unavailable" },
      }],
      skipped: [],
    }))
    const response = await createAiFrontierCronHandler(runSync, runImport)(authorizedRequest())

    expect(response.status).toBeGreaterThanOrEqual(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      catalog: { total: 109, created: 1, updated: 1, unchanged: 107 },
      import: {
        counts: { completed: 0, failed: 1, skipped: 0 },
        completed: [],
        failed: [{
          sourceKey: page.sourceKey,
          reason: "analysis",
          detail: { name: "ProviderError", message: "provider unavailable" },
        }],
        skipped: [],
      },
    })
  })

  it("imports one of three same-run pages and reports the other durable pending rows", async () => {
    process.env.CRON_SECRET = "cron-secret"
    const pages = [createdPage(21), createdPage(20), createdPage(19)]
    const runSync = vi.fn(async () => ({
      ...catalogResult, created: 3, unchanged: 105, createdPages: pages,
    }))
    const runImport = vi.fn(async (rows: readonly DwarkeshBatchCandidate[]) => ({
      completed: rows.map(({ sourceKey }) => sourceKey), failed: [], skipped: [],
    }))
    const response = await createAiFrontierCronHandler(runSync, runImport)(authorizedRequest())

    expect(response.status).toBe(200)
    expect(runImport).toHaveBeenCalledOnce()
    expect(runImport.mock.calls[0]?.[0]).toEqual([expect.objectContaining({
      sourceKey: pages[0]!.sourceKey,
    })])
    await expect(response.json()).resolves.toMatchObject({
      pending: [pages[1]!.sourceKey, pages[2]!.sourceKey],
    })
  })

  it("selects durable pending and stale imports but never takes over a fresh collecting row", () => {
    const now = new Date("2026-08-20T12:00:00.000Z")
    const base = {
      name: "Episode", episodeNumber: null, published: "2026-08-20", recorded: null,
      reviewed: false, topics: [], models: [], people: [], youtube: null,
      duration: null, summary: null, keyTerms: [], source: "dwarkesh" as const,
      sourceIdentityPersisted: true,
    }
    const index = {
      status: "ok" as const,
      sources: { episodes: "ok" as const, concepts: "ok" as const },
      episodeIndex: {}, concepts: [],
      episodes: [
        { ...base, id: "pending", status: "수집 대기", sourceKey: "DWARKESH:PENDING", transcriptSource: "https://www.dwarkesh.com/p/pending", lastEditedAt: "2026-08-20T11:59:00.000Z" },
        { ...base, id: "fresh", status: "수집 중", sourceKey: "DWARKESH:FRESH", transcriptSource: "https://www.dwarkesh.com/p/fresh", lastEditedAt: "2026-08-20T11:50:01.000Z" },
        { ...base, id: "stale", status: "수집 중", sourceKey: "DWARKESH:STALE", transcriptSource: "https://www.dwarkesh.com/p/stale", lastEditedAt: "2026-08-20T11:49:59.000Z" },
      ],
    }

    expect(selectAutomaticDwarkeshCandidates(index, now).map(({ sourceKey }) => sourceKey))
      .toEqual(["DWARKESH:PENDING", "DWARKESH:STALE"])
  })

  it("a later invocation drains one durable pending row when no page was created in that run", async () => {
    process.env.CRON_SECRET = "cron-secret"
    const page = createdPage(20)
    const runSync = vi.fn(async () => catalogResult)
    const runImport = vi.fn(async () => ({
      completed: [page.sourceKey], failed: [], skipped: [],
    }))
    const recovery = {
      loadIndex: vi.fn(async () => ({
        status: "ok" as const,
        sources: { episodes: "ok" as const, concepts: "ok" as const },
        episodeIndex: { [page.sourceKey]: page.pageId }, concepts: [],
        episodes: [{
          id: page.pageId, name: "Pending", episodeNumber: null,
          status: "수집 대기", published: page.published, recorded: null,
          lastEditedAt: "2026-08-20T11:59:00.000Z", reviewed: false,
          topics: [], models: [], people: [], youtube: null,
          transcriptSource: page.officialUrl, duration: null, summary: null, keyTerms: [],
          source: "dwarkesh" as const, sourceKey: page.sourceKey,
          sourceIdentityPersisted: true,
        }],
      })),
      now: () => new Date("2026-08-20T12:00:00.000Z"),
    }

    const response = await createRouteHandler(runSync, runImport, recovery)(authorizedRequest())

    expect(response.status).toBe(200)
    expect(runImport).toHaveBeenCalledWith([expect.objectContaining({
      sourceKey: page.sourceKey,
    })])
  })

  it("reports an isolated source failure after AI Frontier sync without starting imports", async () => {
    process.env.CRON_SECRET = "cron-secret"
    const runSync = vi.fn(async () => ({
      ...catalogResult,
      sourceFailures: [{ source: "dwarkesh" as const, reason: "upstream" as const, status: 503 }],
    }))
    const runImport = vi.fn()

    const response = await createAiFrontierCronHandler(runSync, runImport)(authorizedRequest())

    expect(response.status).toBe(502)
    expect(runImport).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({
      catalog: { updated: 1 },
      sources: [{ source: "dwarkesh", reason: "upstream", status: 503 }],
      error: { name: "CatalogSourceError" },
    })
  })

  it("fails closed on four new Dwarkesh pages before import while reporting metadata counts", async () => {
    process.env.CRON_SECRET = "cron-secret"
    const pages = [createdPage(22), createdPage(21), createdPage(20), createdPage(19)]
    const runSync = vi.fn(async () => ({
      ...catalogResult, created: 4, unchanged: 104, createdPages: pages,
    }))
    const runImport = vi.fn()
    const response = await createAiFrontierCronHandler(runSync, runImport)(authorizedRequest())

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(runImport).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      catalog: { total: 109, created: 4, updated: 1, unchanged: 104 },
      import: { completed: [], failed: [], skipped: [] },
      error: { name: "AiFrontierCronSafetyError" },
    })
  })

  it("filters mixed created pages to Dwarkesh without auto-importing AI Frontier", async () => {
    process.env.CRON_SECRET = "cron-secret"
    const pages = [
      createdPage(110, "ai-frontier"), createdPage(20),
      createdPage(109, "ai-frontier"), createdPage(19),
    ]
    const runSync = vi.fn(async () => ({
      ...catalogResult, created: 4, unchanged: 104, createdPages: pages,
    }))
    const runImport = vi.fn(async (rows: readonly DwarkeshBatchCandidate[]) => ({
      completed: rows.map(({ sourceKey }) => sourceKey), failed: [], skipped: [],
    }))
    const response = await createAiFrontierCronHandler(runSync, runImport)(authorizedRequest())

    expect(response.status).toBe(200)
    expect(runImport.mock.calls[0]?.[0].map((row) => row.sourceKey)).toEqual([
      pages[1]!.sourceKey,
    ])
    await expect(response.json()).resolves.toMatchObject({
      pending: [pages[3]!.sourceKey],
    })
  })

  it("keeps AI Frontier catalog creates unchanged without importing them", async () => {
    process.env.CRON_SECRET = "cron-secret"
    const aiPage = createdPage(110, "ai-frontier")
    const runSync = vi.fn(async () => ({
      ...catalogResult, created: 1, unchanged: 107, createdPages: [aiPage],
    }))
    const runImport = vi.fn()
    const response = await createAiFrontierCronHandler(runSync, runImport)(authorizedRequest())

    expect(response.status).toBe(200)
    expect(runImport).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({
      catalog: { created: 1 },
      import: { completed: [], failed: [], skipped: [] },
    })
  })

  it("redacts the exact reachable notionRequest response body error", async () => {
    process.env.CRON_SECRET = "cron-secret"
    const payload = JSON.stringify({
      object: "error",
      api_key: "sk-route-secret",
      token: "token_route_secret",
      authorization: "Basic quoted-route-secret",
    })
    const clientError = await notionHttpError(payload, 400)
    expect(clientError.message).toBe("Notion API request failed.")
    const runSync = vi.fn(async () => { throw clientError })
    const response = await createAiFrontierCronHandler(runSync, vi.fn())(authorizedRequest())
    const body: unknown = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({
      error: {
        name: "NotionRequestError",
        message: "Notion API request failed.",
        status: 400,
      },
    })
    expect(JSON.stringify(body)).not.toMatch(
      /sk-route-secret|token_route_secret|quoted-route-secret|api_key|authorization/
    )
  })

  it.each([
    ["Basic", "dXNlcjpwYXNzPT0="],
    ["Token", "token-value.trailing"],
    ["Digest", "digest-value.trailing"],
    ["Bearer", "bearer-value.trailing"],
  ])("redacts the complete Authorization: %s credential from route diagnostics", async (scheme, credential) => {
    process.env.CRON_SECRET = "cron-secret"
    const page = createdPage(19)
    const runSync = vi.fn(async () => ({
      ...catalogResult, created: 1, unchanged: 107, createdPages: [page],
    }))
    class CredentialDiagnosticError extends Error {
      override name = "CredentialDiagnosticError"
    }
    const runImport = vi.fn(async () => {
      throw new CredentialDiagnosticError(
        `upstream Authorization: ${scheme} ${credential} safe-marker\nunsafe-second-line`
      )
    })
    const response = await createAiFrontierCronHandler(runSync, runImport)(authorizedRequest())
    const body: unknown = await response.json()

    expect(response.status).toBe(500)
    expect(body).toMatchObject({
      error: {
        name: "UpstreamError",
        message: "Upstream operation failed.",
      },
    })
    expect(JSON.stringify(body)).not.toContain(credential)
    expect(JSON.stringify(body)).not.toContain("unsafe-second-line")
  })

  it.each([
    ["missing created results", { ...catalogResult, created: 1, createdPages: undefined }],
    ["duplicate created keys", {
      ...catalogResult, created: 2,
      createdPages: [createdPage(20), { ...createdPage(20), pageId: "other-page" }],
    }],
    ["duplicate created pages", {
      ...catalogResult, created: 2,
      createdPages: [createdPage(20), { ...createdPage(19), pageId: "page-20" }],
    }],
    ["null Dwarkesh date", {
      ...catalogResult, created: 1,
      createdPages: [{ ...createdPage(20), published: null }],
    }],
  ])("rejects malformed sync output (%s) before import", async (_name, malformed) => {
    process.env.CRON_SECRET = "cron-secret"
    const runSync = vi.fn(async () => malformed)
    const runImport = vi.fn()
    const response = await createAiFrontierCronHandler(runSync, runImport)(authorizedRequest())

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(runImport).not.toHaveBeenCalled()
  })
})
