import { describe, expect, it, vi } from "vitest"

import type { AiFrontierIndex } from "@/lib/types/ai-frontier"

import { createFrontierIndexHandler, GET } from "./route"

function makeIndex(overrides: Partial<AiFrontierIndex> = {}): AiFrontierIndex {
  return {
    status: "ok",
    sources: { episodes: "ok", concepts: "ok" },
    episodes: [
      {
        id: "3b2908af-0000-0000-0000-0000000000e1",
        name: "EP107 — Scaling laws",
        episodeNumber: 107,
        status: "Published",
        published: "2026-07-30",
        recorded: "2026-07-28",
        reviewed: false,
        topics: ["Scaling"],
        models: ["Claude"],
        people: ["Andrej"],
        youtube: "https://youtube.com/watch?v=x",
        transcriptSource: "전사 기반",
        duration: "1:02:00",
        keyTerms: ["scaling law"],
      },
    ],
    concepts: [
      {
        id: "3b2908af-0000-0000-0000-0000000000c1",
        term: "Scaling law",
        korean: "스케일링 법칙",
        category: "Training",
        verified: "전사 기반",
        oneLine: "모델 크기와 성능의 관계",
        intuition: null,
        whyItMatters: null,
        source: null,
        episodes: [{ ref: "EP107", available: true, pageId: "3b2908af-0000-0000-0000-0000000000e1" }],
      },
    ],
    episodeIndex: { EP107: "3b2908af-0000-0000-0000-0000000000e1" },
    ...overrides,
  }
}

describe("GET /api/andrej/frontier", () => {
  it("exports a route-level GET handler", () => {
    expect(typeof GET).toBe("function")
  })

  it("returns the ok index as HTTP 200 with no-store caching", async () => {
    const load = vi.fn().mockResolvedValue(makeIndex())
    const response = await createFrontierIndexHandler(load)()
    const body = (await response.json()) as AiFrontierIndex

    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(body.status).toBe("ok")
    expect(body.episodes).toHaveLength(1)
    expect(body.concepts[0].episodes[0]).toEqual({
      ref: "EP107",
      available: true,
      pageId: "3b2908af-0000-0000-0000-0000000000e1",
    })
    expect(body.episodeIndex).toEqual({ EP107: "3b2908af-0000-0000-0000-0000000000e1" })
  })

  it("serializes a partial index as HTTP 200 and preserves independent source statuses", async () => {
    const load = vi.fn().mockResolvedValue(
      makeIndex({
        status: "partial",
        sources: { episodes: "ok", concepts: "unavailable" },
        concepts: [],
      }),
    )
    const response = await createFrontierIndexHandler(load)()
    const body = (await response.json()) as AiFrontierIndex

    expect(response.status).toBe(200)
    expect(body.status).toBe("partial")
    expect(body.sources).toEqual({ episodes: "ok", concepts: "unavailable" })
    expect(body.episodes).toHaveLength(1)
    expect(body.concepts).toEqual([])
  })

  it("serializes an unavailable index as HTTP 200", async () => {
    const load = vi.fn().mockResolvedValue(
      makeIndex({
        status: "unavailable",
        sources: { episodes: "unavailable", concepts: "unavailable" },
        episodes: [],
        concepts: [],
        episodeIndex: {},
      }),
    )
    const response = await createFrontierIndexHandler(load)()
    const body = (await response.json()) as AiFrontierIndex

    expect(response.status).toBe(200)
    expect(body.status).toBe("unavailable")
    expect(body.sources).toEqual({ episodes: "unavailable", concepts: "unavailable" })
  })

  it("degrades an unexpected loader rejection into an honest unavailable 200 payload", async () => {
    const load = vi.fn().mockRejectedValue(new Error("Notion API error 401: secret-token-abc"))
    const response = await createFrontierIndexHandler(load)()
    const body = (await response.json()) as AiFrontierIndex

    expect(response.status).toBe(200)
    expect(body.status).toBe("unavailable")
    expect(body.sources).toEqual({ episodes: "unavailable", concepts: "unavailable" })
    expect(body.episodes).toEqual([])
    expect(body.concepts).toEqual([])
    expect(body.episodeIndex).toEqual({})
  })

  it("never leaks upstream Notion error text on failure", async () => {
    const load = vi.fn().mockRejectedValue(new Error("Notion API error 401: secret-token-abc"))
    const response = await createFrontierIndexHandler(load)()
    const raw = JSON.stringify(await response.json())

    expect(raw).not.toContain("secret-token-abc")
    expect(raw).not.toContain("401")
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
  })

  it("calls the injected loader exactly once per request", async () => {
    const load = vi.fn().mockResolvedValue(makeIndex())
    await createFrontierIndexHandler(load)()

    expect(load).toHaveBeenCalledTimes(1)
  })
})
