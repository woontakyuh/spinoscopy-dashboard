import { describe, expect, it, vi } from "vitest"

import type { AiFrontierEpisode } from "@/lib/types/ai-frontier"
import type { AiFrontierCatalogEpisode } from "@/lib/types/ai-frontier-import"

import type { AiFrontierNotionRequest } from "./ai-frontier"
import { syncAiFrontierCatalog } from "./ai-frontier-catalog"

const catalog: AiFrontierCatalogEpisode[] = [
  {
    episodeNumber: 107,
    name: "EP107. 최신 에피소드",
    officialUrl: "https://aifrontier.kr/ko/episodes/ep107",
    published: "2026-08-02",
    duration: "PT1H55M37S",
    youtube: "https://www.youtube.com/watch?v=latest",
    summary: "공식 설명",
  },
  {
    episodeNumber: 45,
    name: "EP45. 오래된 에피소드",
    officialUrl: "https://aifrontier.kr/ko/episodes/ep45",
    published: "2025-03-29",
    duration: "PT31M39S",
    youtube: "https://www.youtube.com/watch?v=old",
    summary: "오래된 설명",
  },
]

function existingEpisode(overrides: Partial<AiFrontierEpisode> = {}): AiFrontierEpisode {
  return {
    id: "page-107",
    name: "EP107. 최신 에피소드",
    episodeNumber: 107,
    status: "완료",
    published: "2026-08-02",
    recorded: null,
    reviewed: false,
    topics: ["Agent"],
    models: [],
    people: ["노정석"],
    youtube: "https://www.youtube.com/watch?v=latest",
    transcriptSource: null,
    duration: "PT1H55M37S",
    summary: "기존 정리",
    keyTerms: ["Agent"],
    ...overrides,
  }
}

describe("AI Frontier 카탈로그 Notion 동기화", () => {
  it("기존 완료 Episode는 정리를 보존하고 공식 링크만 보완한다", async () => {
    const request = vi.fn<AiFrontierNotionRequest>(async () => ({}))

    const result = await syncAiFrontierCatalog(catalog.slice(0, 1), [existingEpisode()], {
      request,
      pause: async () => undefined,
    })

    expect(result).toEqual({ created: 0, updated: 1, unchanged: 0 })
    expect(request).toHaveBeenCalledWith("/pages/page-107", expect.objectContaining({
      method: "PATCH",
      body: expect.stringContaining('"Transcript Source":{"url":"https://aifrontier.kr/ko/episodes/ep107"}'),
    }))
    expect(request.mock.calls[0]?.[1]?.body).not.toContain('"Status"')
    expect(request.mock.calls[0]?.[1]?.body).not.toContain('"한줄요약"')
  })

  it("없는 Episode는 제목과 링크를 목록 상태로 만든다", async () => {
    const request = vi.fn<AiFrontierNotionRequest>(async () => ({ id: "new-page" }))

    const result = await syncAiFrontierCatalog(catalog.slice(1), [], {
      request,
      pause: async () => undefined,
    })

    expect(result).toEqual({ created: 1, updated: 0, unchanged: 0 })
    expect(request).toHaveBeenCalledWith("/pages", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"Status":{"select":{"name":"목록"}}'),
    }))
    const body = String(request.mock.calls[0]?.[1]?.body)
    expect(body).toContain('"Name":{"title":[{"text":{"content":"EP45. 오래된 에피소드"}}]}')
    expect(body).toContain('"Transcript Source":{"url":"https://aifrontier.kr/ko/episodes/ep45"}')
  })

  it("제목과 공식 링크가 같은 기존 Episode는 쓰지 않는다", async () => {
    const request = vi.fn<AiFrontierNotionRequest>(async () => ({}))
    const existing = existingEpisode({
      transcriptSource: "https://aifrontier.kr/ko/episodes/ep107",
    })

    const result = await syncAiFrontierCatalog(catalog.slice(0, 1), [existing], {
      request,
      pause: async () => undefined,
    })

    expect(result).toEqual({ created: 0, updated: 0, unchanged: 1 })
    expect(request).not.toHaveBeenCalled()
  })
})
