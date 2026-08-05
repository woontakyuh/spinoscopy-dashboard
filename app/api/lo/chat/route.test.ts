import { describe, expect, it, vi } from "vitest"

import { createLoChatPostHandler } from "./route"

function request(body: string): Request {
  return new Request("http://localhost/api/lo/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  })
}

describe("POST /api/lo/chat", () => {
  it("returns a deterministic invalid_request response for malformed palette requests", async () => {
    const run = vi.fn()
    const POST = createLoChatPostHandler({ apiKey: () => "test-key", run })

    const malformedJson = await POST(request("{"))
    expect(malformedJson.status).toBe(400)
    await expect(malformedJson.json()).resolves.toEqual({ error: "invalid_request" })

    const unsupportedCommand = await POST(request(JSON.stringify({ commandId: "save-memory" })))
    expect(unsupportedCommand.status).toBe(400)
    await expect(unsupportedCommand.json()).resolves.toEqual({ error: "invalid_request" })
    expect(run).not.toHaveBeenCalled()
  })

  it("returns provider_unavailable without invoking chat when OPENAI_API_KEY is absent", async () => {
    const run = vi.fn()
    const POST = createLoChatPostHandler({ apiKey: () => undefined, run })

    const response = await POST(request(JSON.stringify({ commandId: "review-training" })))

    expect(response.status).toBe(503)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    await expect(response.json()).resolves.toEqual({ error: "provider_unavailable" })
    expect(run).not.toHaveBeenCalled()
  })

  it("honors the query palette transport with an accepted JSON acknowledgement", async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    const POST = createLoChatPostHandler({ apiKey: () => "test-key", run })

    const response = await POST(request(JSON.stringify({ commandId: "review-memory" })))

    expect(run).toHaveBeenCalledWith({ commandId: "review-memory" }, "test-key")
    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    await expect(response.json()).resolves.toEqual({ accepted: true })
  })

  it("keeps provider failures opaque", async () => {
    const POST = createLoChatPostHandler({
      apiKey: () => "test-key",
      run: vi.fn().mockRejectedValue(new Error("OPENAI_API_KEY=secret")),
    })

    const response = await POST(request(JSON.stringify({ commandId: "review-game-map" })))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: "internal_error" })
  })
})
