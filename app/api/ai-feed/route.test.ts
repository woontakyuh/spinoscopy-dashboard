import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { fetchTextNoStoreMock } = vi.hoisted(() => ({
  fetchTextNoStoreMock: vi.fn<(url: string) => Promise<string>>(),
}))

vi.mock("@/lib/radar/feedCache", () => ({
  cachedFeedItems: async <T>(
    _key: string,
    _revalidate: number,
    loader: () => Promise<T>
  ): Promise<T> => loader(),
  fetchTextNoStore: fetchTextNoStoreMock,
}))

import { GET } from "./route"

const THE_BATCH_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>The Batch</title>
    <item>
      <title><![CDATA[Models Learn to Verify Their Own Work]]></title>
      <link>https://charonhub.deeplearning.ai/models-learn-to-verify/</link>
      <guid isPermaLink="false">batch-post-359</guid>
      <dc:creator><![CDATA[DeepLearning.AI]]></dc:creator>
      <pubDate>Fri, 31 Jul 2026 15:15:39 GMT</pubDate>
    </item>
  </channel>
</rss>`

describe("GET /api/ai-feed The Batch", () => {
  beforeEach(() => {
    fetchTextNoStoreMock.mockImplementation(async (url) =>
      url === "https://charonhub.deeplearning.ai/rss/" ? THE_BATCH_RSS : ""
    )
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 }))
    )
  })

  afterEach(() => {
    fetchTextNoStoreMock.mockReset()
    vi.unstubAllGlobals()
  })

  it("공식 RSS의 최신 글을 The Batch 뉴스로 반환한다", async () => {
    const response = await GET()
    const body = await response.json()
    const item = body.items.find(
      (candidate: { source?: string }) => candidate.source === "the-batch"
    )

    expect(fetchTextNoStoreMock).toHaveBeenCalledWith(
      "https://charonhub.deeplearning.ai/rss/"
    )
    expect(item).toMatchObject({
      source: "the-batch",
      sourceLabel: "The Batch",
      title: "Models Learn to Verify Their Own Work",
      url: "https://charonhub.deeplearning.ai/models-learn-to-verify/",
      author: "DeepLearning.AI",
      date: "2026-07-31",
    })
  })
})
