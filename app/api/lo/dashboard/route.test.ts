import { describe, expect, it, vi } from "vitest"

const getLoDashboard = vi.hoisted(() => vi.fn())

vi.mock("@/lib/lo/dashboard", () => ({ getLoDashboard }))

import { GET } from "./route"

describe("GET /api/lo/dashboard", () => {
  it("returns the composed Lo dashboard response without caching personal data", async () => {
    getLoDashboard.mockResolvedValueOnce({
      version: "v1",
      generatedAt: "2026-08-04T12:00:00.000Z",
      profile: { status: "ready", data: { pageId: "profile-1" }, citations: [] },
      training: { status: "ready", data: [], citations: [] },
      fitness: { status: "ready", data: { snapshot: null, trends: [] }, citations: [] },
      graph: { status: "ready", data: null, citations: [] },
      memory: { status: "ready", data: [], citations: [] },
      sync: { status: "ready", data: { sources: [] }, citations: [] },
      legends: { status: "empty", data: [], citations: [] },
      sources: [],
      citationIdsBySubject: {},
      graphDiagnostics: [],
      citations: [],
    })

    const response = await GET()

    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    await expect(response.json()).resolves.toMatchObject({
      version: "v1",
      generatedAt: "2026-08-04T12:00:00.000Z",
      profile: { status: "ready", data: { pageId: "profile-1" }, citations: [] },
      graphDiagnostics: [],
    })
  })

  it("does not expose internal source errors when dashboard composition fails unexpectedly", async () => {
    getLoDashboard.mockRejectedValueOnce(new Error("NOTION_TOKEN=super-secret"))

    const response = await GET()

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: "Lo dashboard is temporarily unavailable" })
  })
})
