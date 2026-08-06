import { describe, expect, it, vi } from "vitest"

import type { AiFrontierEpisodeDetail } from "@/lib/types/ai-frontier"

import { createFrontierDetailHandler, GET } from "./route"

const PAGE_ID = "3b2908af-0000-0000-0000-0000000000e1"

function makeDetail(overrides: Partial<AiFrontierEpisodeDetail> = {}): AiFrontierEpisodeDetail {
  return {
    id: PAGE_ID,
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
    blocks: [{ id: "b1", type: "paragraph", text: "스케일링 법칙 개요" }],
    truncated: false,
    ...overrides,
  }
}

/** Next 16 dynamic route params arrive as a Promise. */
function params(pageId: string): { params: Promise<{ pageId: string }> } {
  return { params: Promise.resolve({ pageId }) }
}

class NotFound extends Error {
  constructor() {
    super(`Episode not found in index: ${PAGE_ID}`)
    this.name = "AiFrontierEpisodeNotFoundError"
  }
}

describe("GET /api/andrej/frontier/episodes/[pageId]", () => {
  it("exports a route-level GET handler", () => {
    expect(typeof GET).toBe("function")
  })

  it("returns the bounded episode detail as HTTP 200 with no-store caching", async () => {
    const load = vi.fn().mockResolvedValue(makeDetail())
    const response = await createFrontierDetailHandler(load)(new Request("http://x"), params(PAGE_ID))
    const body = (await response.json()) as AiFrontierEpisodeDetail

    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(body.id).toBe(PAGE_ID)
    expect(body.blocks).toHaveLength(1)
    expect(body.truncated).toBe(false)
    expect(load).toHaveBeenCalledWith(PAGE_ID)
  })

  it("preserves truncated:true from the bounded loader", async () => {
    const load = vi.fn().mockResolvedValue(makeDetail({ truncated: true }))
    const response = await createFrontierDetailHandler(load)(new Request("http://x"), params(PAGE_ID))
    const body = (await response.json()) as AiFrontierEpisodeDetail

    expect(response.status).toBe(200)
    expect(body.truncated).toBe(true)
  })

  it("rejects a blank page id with HTTP 400 and never calls the loader", async () => {
    const load = vi.fn()
    const response = await createFrontierDetailHandler(load)(new Request("http://x"), params("   "))
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(400)
    expect(body.error).toBeTruthy()
    expect(load).not.toHaveBeenCalled()
  })

  it("rejects an empty page id with HTTP 400 and never calls the loader", async () => {
    const load = vi.fn()
    const response = await createFrontierDetailHandler(load)(new Request("http://x"), params(""))

    expect(response.status).toBe(400)
    expect(load).not.toHaveBeenCalled()
  })

  it("rejects a malformed page id with HTTP 400 and never calls the loader", async () => {
    const load = vi.fn()
    const response = await createFrontierDetailHandler(load)(
      new Request("http://x"),
      params("../../etc/passwd"),
    )

    expect(response.status).toBe(400)
    expect(load).not.toHaveBeenCalled()
  })

  it("accepts a dashless 32-character Notion id", async () => {
    const dashless = PAGE_ID.replace(/-/g, "")
    const load = vi.fn().mockResolvedValue(makeDetail({ id: dashless }))
    const response = await createFrontierDetailHandler(load)(new Request("http://x"), params(dashless))

    expect(response.status).toBe(200)
    expect(load).toHaveBeenCalledWith(dashless)
  })

  it("maps an unknown episode to HTTP 404", async () => {
    const load = vi.fn().mockRejectedValue(new NotFound())
    const response = await createFrontierDetailHandler(load)(new Request("http://x"), params(PAGE_ID))
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(404)
    expect(body.error).toBeTruthy()
  })

  it("maps a Notion failure to HTTP 502", async () => {
    const load = vi.fn().mockRejectedValue(new Error("Notion API error 500: upstream exploded"))
    const response = await createFrontierDetailHandler(load)(new Request("http://x"), params(PAGE_ID))
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(502)
    expect(body.error).toBeTruthy()
  })

  it("sanitizes upstream error text out of the 502 body", async () => {
    const load = vi.fn().mockRejectedValue(
      new Error("Notion API error 401: Bearer secret-token-abc unauthorized"),
    )
    const response = await createFrontierDetailHandler(load)(new Request("http://x"), params(PAGE_ID))
    const raw = JSON.stringify(await response.json())

    expect(raw).not.toContain("secret-token-abc")
    expect(raw).not.toContain("Bearer")
    expect(raw).not.toContain("401")
  })

  it("sets no-store caching on error responses too", async () => {
    const load = vi.fn().mockRejectedValue(new NotFound())
    const response = await createFrontierDetailHandler(load)(new Request("http://x"), params(PAGE_ID))

    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
  })

  it("trims surrounding whitespace before delegating to the loader", async () => {
    const load = vi.fn().mockResolvedValue(makeDetail())
    const response = await createFrontierDetailHandler(load)(
      new Request("http://x"),
      params(`  ${PAGE_ID}  `),
    )

    expect(response.status).toBe(200)
    expect(load).toHaveBeenCalledWith(PAGE_ID)
  })
})
