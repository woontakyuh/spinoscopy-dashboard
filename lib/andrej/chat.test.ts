import { describe, expect, it, vi } from "vitest"

import type { FeedItem } from "@/lib/types/radar"
import {
  AndrejChatResponseError,
  createOpenAIAndrejProvider,
  loadAndrejFeedSnapshot,
  type AndrejFeedSnapshot,
} from "./chat"

const feedItem: FeedItem = {
  id: "anthropic-1",
  title: "A new Anthropic engineering post",
  url: "https://www.anthropic.com/engineering/example",
  source: "anthropic-engineering",
  sourceLabel: "Anthropic Engineering",
  tier: "ai-company",
  cadence: "weekly",
  author: "Anthropic",
  date: "2026-08-03",
  points: null,
  commentUrl: null,
  summary: "에이전트 안정성을 개선한 공식 문서입니다.",
  categories: ["research"],
  importanceScore: 5,
  notes: "공식 기술 문서",
}

const feed: AndrejFeedSnapshot = {
  capturedAt: "2026-08-05T06:00:00.000Z",
  items: [feedItem],
}

describe("OpenAI Andrej provider", () => {
  it("sends the dashboard feed with web search and returns cited research", async () => {
    // Given
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output: [{
        type: "message",
        content: [{
          type: "output_text",
          text: "운탁씨, 지난주 핵심은 에이전트 안정성 개선입니다.",
          annotations: [{
            type: "url_citation",
            title: "Anthropic Engineering",
            url: "https://www.anthropic.com/engineering/example",
          }],
        }],
      }],
    }), { status: 200 }))
    const provider = createOpenAIAndrejProvider({
      apiKey: "openai-test-key",
      fetchImpl,
    })

    // When
    const answer = await provider.respond({
      messages: [{ role: "user", content: "Anthropic 공식 블로그 지난주 글을 정리해줘" }],
      feed,
    })

    // Then
    const request = fetchImpl.mock.calls[0]?.[1]
    const body = JSON.parse(String(request?.body)) as {
      model: string
      input: Array<{ role: string; content: Array<{ type: string; text: string }> }>
      tools: Array<{ type: string }>
      store: boolean
    }
    expect(body.model).toBe("gpt-5.6-luna")
    expect(body.tools).toEqual([{ type: "web_search" }])
    expect(body.store).toBe(false)
    expect(JSON.parse(body.input[0].content[0].text)).toEqual({
      kind: "dashboard_ai_feed_snapshot",
      snapshot: feed,
    })
    expect(body.input[1]).toEqual({
      role: "user",
      content: [{ type: "input_text", text: "Anthropic 공식 블로그 지난주 글을 정리해줘" }],
    })
    expect(answer).toBe([
      "운탁씨, 지난주 핵심은 에이전트 안정성 개선입니다.",
      "",
      "출처:",
      "- Anthropic Engineering: https://www.anthropic.com/engineering/example",
    ].join("\n"))
  })

  it("rejects malformed provider output", async () => {
    // Given
    const provider = createOpenAIAndrejProvider({
      apiKey: "openai-test-key",
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: [] }), { status: 200 })),
    })

    // When / Then
    await expect(provider.respond({
      messages: [{ role: "user", content: "지난주 피드 세 개" }],
      feed,
    })).rejects.toBeInstanceOf(AndrejChatResponseError)
  })
})

describe("Andrej dashboard feed snapshot", () => {
  it("loads the current Andrej page feed as model context", async () => {
    // Given
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [feedItem],
      fetchedAt: feed.capturedAt,
    }), { status: 200 }))
    const request = new Request("http://localhost/api/andrej/conversation")

    // When
    const snapshot = await loadAndrejFeedSnapshot(request, fetchImpl)

    // Then
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost/api/ai-feed",
      expect.objectContaining({ cache: "no-store" }),
    )
    expect(snapshot).toEqual(feed)
  })
})
