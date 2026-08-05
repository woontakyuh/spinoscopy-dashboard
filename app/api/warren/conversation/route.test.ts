import { describe, expect, it, vi } from "vitest"

import type { WarrenMarketSnapshot } from "@/lib/warren/chat"
import { createWarrenConversationPostHandler } from "./route"

const market: WarrenMarketSnapshot = {
  capturedAt: "2026-08-05T06:00:00.000Z",
  prices: [],
  indicators: [],
  news: [],
}

function request(body: string): Request {
  return new Request("http://localhost/api/warren/conversation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  })
}

const messages = [{
  id: "message-1",
  role: "user",
  parts: [{ type: "text", text: "한국 금리 전망을 조사해줘" }],
}]

describe("POST /api/warren/conversation", () => {
  it("rejects malformed dashboard chat payloads", async () => {
    const respond = vi.fn()
    const POST = createWarrenConversationPostHandler({
      apiKey: () => "test-key",
      loadMarket: vi.fn(),
      respond,
    })

    const response = await POST(request(JSON.stringify({ messages: [] })))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "invalid_request" })
    expect(respond).not.toHaveBeenCalled()
  })

  it("returns provider_unavailable when OPENAI_API_KEY is absent", async () => {
    const respond = vi.fn()
    const POST = createWarrenConversationPostHandler({
      apiKey: () => undefined,
      loadMarket: vi.fn(),
      respond,
    })

    const response = await POST(request(JSON.stringify({ messages })))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: "provider_unavailable" })
    expect(respond).not.toHaveBeenCalled()
  })

  it("grounds OpenAI chat in the current Warren dashboard snapshot", async () => {
    const respond = vi.fn().mockResolvedValue("조사 결과입니다.")
    const loadMarket = vi.fn().mockResolvedValue(market)
    const POST = createWarrenConversationPostHandler({
      apiKey: () => "test-key",
      loadMarket,
      respond,
    })

    const response = await POST(request(JSON.stringify({ messages })))

    expect(loadMarket).toHaveBeenCalledOnce()
    expect(respond).toHaveBeenCalledWith({
      messages: [{ role: "user", content: "한국 금리 전망을 조사해줘" }],
      market,
    }, "test-key")
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8")
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    await expect(response.text()).resolves.toBe("조사 결과입니다.")
  })
})
