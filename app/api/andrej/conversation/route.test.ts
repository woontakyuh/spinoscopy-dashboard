import { describe, expect, it, vi } from "vitest"

import type { AndrejFeedSnapshot } from "@/lib/andrej/chat"
import { createAndrejConversationPostHandler } from "./route"

const feed: AndrejFeedSnapshot = {
  capturedAt: "2026-08-05T06:00:00.000Z",
  items: [],
}

function request(body: string): Request {
  return new Request("http://localhost/api/andrej/conversation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  })
}

const messages = [{
  id: "message-1",
  role: "user",
  parts: [{ type: "text", text: "지난주 핫했던 피드 3개만 정리해줘" }],
}]

describe("POST /api/andrej/conversation", () => {
  it("rejects malformed dashboard chat payloads", async () => {
    // Given
    const respond = vi.fn()
    const POST = createAndrejConversationPostHandler({
      apiKey: () => "test-key",
      loadFeed: vi.fn(),
      respond,
    })

    // When
    const response = await POST(request(JSON.stringify({ messages: [] })))

    // Then
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "invalid_request" })
    expect(respond).not.toHaveBeenCalled()
  })

  it("returns provider_unavailable when OPENAI_API_KEY is absent", async () => {
    // Given
    const respond = vi.fn()
    const POST = createAndrejConversationPostHandler({
      apiKey: () => undefined,
      loadFeed: vi.fn(),
      respond,
    })

    // When
    const response = await POST(request(JSON.stringify({ messages })))

    // Then
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: "provider_unavailable" })
    expect(respond).not.toHaveBeenCalled()
  })

  it("grounds OpenAI chat in the current Andrej dashboard feed", async () => {
    // Given
    const respond = vi.fn().mockResolvedValue("운탁씨, 세 가지로 추렸습니다.")
    const loadFeed = vi.fn().mockResolvedValue(feed)
    const POST = createAndrejConversationPostHandler({
      apiKey: () => "test-key",
      loadFeed,
      respond,
    })

    // When
    const response = await POST(request(JSON.stringify({ messages })))

    // Then
    expect(loadFeed).toHaveBeenCalledOnce()
    expect(respond).toHaveBeenCalledWith({
      messages: [{ role: "user", content: "지난주 핫했던 피드 3개만 정리해줘" }],
      feed,
    }, "test-key")
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8")
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    await expect(response.text()).resolves.toBe("운탁씨, 세 가지로 추렸습니다.")
  })
})
