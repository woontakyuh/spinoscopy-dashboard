import { describe, expect, it, vi } from "vitest"

import {
  WarrenChatResponseError,
  createOpenAIWarrenProvider,
  type WarrenMarketSnapshot,
} from "./chat"

const market: WarrenMarketSnapshot = {
  capturedAt: "2026-08-05T06:00:00.000Z",
  prices: [{
    symbol: "BTC",
    label: "비트코인",
    price: 115_000,
    change24h: 2.4,
    currency: "USD",
  }],
  indicators: [{
    key: "kospi",
    label: "KOSPI",
    value: 3_200,
    change: 0.7,
    unit: "",
  }],
  news: [{
    title: "시장 뉴스",
    source: "Reuters",
    date: "2026-08-05",
    asset: "BTC",
    url: "https://example.com/market",
  }],
}

describe("OpenAI Warren provider", () => {
  it("uses web search without exposing citations by default", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output: [{
        type: "message",
        content: [{
          type: "output_text",
          text: "금리 기대와 위험선호가 함께 움직였습니다. ([Federal Reserve](https://www.federalreserve.gov/example))",
          annotations: [{
            type: "url_citation",
            title: "Federal Reserve release",
            url: "https://www.federalreserve.gov/example",
          }],
        }],
      }],
    }), { status: 200 }))
    const provider = createOpenAIWarrenProvider({
      apiKey: "openai-test-key",
      fetchImpl,
    })

    const answer = await provider.respond({
      messages: [{ role: "user", content: "오늘 시장이 오른 이유를 조사해줘" }],
      market,
    })

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
      kind: "dashboard_market_snapshot",
      snapshot: market,
    })
    expect(body.input[1]).toEqual({
      role: "user",
      content: [{ type: "input_text", text: "오늘 시장이 오른 이유를 조사해줘" }],
    })
    expect(answer).toBe("금리 기대와 위험선호가 함께 움직였습니다.")
  })

  it("shows a clean source list only when the user explicitly asks", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output: [{
        type: "message",
        content: [{
          type: "output_text",
          text: "확인했습니다. ([Federal Reserve](https://www.federalreserve.gov/example))",
          annotations: [{
            type: "url_citation",
            title: "Federal Reserve release",
            url: "https://www.federalreserve.gov/example",
          }],
        }],
      }],
    }), { status: 200 }))
    const provider = createOpenAIWarrenProvider({
      apiKey: "openai-test-key",
      fetchImpl,
    })

    const answer = await provider.respond({
      messages: [{ role: "user", content: "그 내용의 출처 링크를 알려줘" }],
      market,
    })

    expect(answer).toBe([
      "확인했습니다.",
      "",
      "출처:",
      "- Federal Reserve release: https://www.federalreserve.gov/example",
    ].join("\n"))
  })

  it("rejects malformed provider output", async () => {
    const provider = createOpenAIWarrenProvider({
      apiKey: "openai-test-key",
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: [] }), { status: 200 })),
    })

    await expect(provider.respond({
      messages: [{ role: "user", content: "시장 요약" }],
      market,
    })).rejects.toBeInstanceOf(WarrenChatResponseError)
  })
})
