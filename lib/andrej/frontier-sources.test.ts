import { describe, expect, it, vi } from "vitest"

import type {
  AiFrontierCatalogEpisode,
  AiFrontierOfficialEpisode,
} from "@/lib/types/ai-frontier-import"

import {
  fetchFrontierCatalog,
  fetchFrontierCatalogSources,
  fetchFrontierEpisode,
  FrontierSourceError,
} from "./frontier-sources"

const aiFrontierEpisode = {
  source: "ai-frontier",
  reference: "EP107",
  episodeNumber: 107,
  name: "EP107. 최신 에피소드",
  officialUrl: "https://aifrontier.kr/ko/episodes/ep107",
  published: "2026-08-02",
  duration: "PT1H",
  youtube: "https://www.youtube.com/watch?v=frontier",
  summary: "AI Frontier",
} satisfies AiFrontierCatalogEpisode

const dwarkeshEpisode = {
  source: "dwarkesh",
  reference: "DWARKESH:RYAN-GREENBLATT",
  episodeNumber: null,
  name: "Ryan Greenblatt",
  officialUrl: "https://www.dwarkesh.com/p/ryan-greenblatt",
  published: "2026-08-11",
  duration: "PT2H",
  youtube: null,
  summary: "Dwarkesh Podcast",
} satisfies AiFrontierCatalogEpisode

function official(
  episode: AiFrontierCatalogEpisode,
  transcript: string
): AiFrontierOfficialEpisode {
  return { ...episode, transcript }
}

describe("Frontier source registry", () => {
  it("모든 소스의 카탈로그를 합쳐 최신순으로 반환한다", async () => {
    const loadAiFrontierCatalog = vi.fn(async () => [aiFrontierEpisode])
    const loadDwarkeshCatalog = vi.fn(async () => [dwarkeshEpisode])

    await expect(fetchFrontierCatalog({
      loadAiFrontierCatalog,
      loadDwarkeshCatalog,
    })).resolves.toEqual([dwarkeshEpisode, aiFrontierEpisode])

    expect(loadAiFrontierCatalog).toHaveBeenCalledOnce()
    expect(loadDwarkeshCatalog).toHaveBeenCalledOnce()
  })

  it("한 source 실패를 typed result로 격리해 다른 catalog를 보존한다", async () => {
    const loadAiFrontierCatalog = vi.fn(async () => [aiFrontierEpisode])
    const loadDwarkeshCatalog = vi.fn(async () => {
      throw new Error("private upstream response")
    })

    const result = await fetchFrontierCatalogSources({
      loadAiFrontierCatalog,
      loadDwarkeshCatalog,
    })

    expect(result.aiFrontier).toEqual({ ok: true, episodes: [aiFrontierEpisode] })
    expect(result.dwarkesh).toEqual({
      ok: false,
      error: { source: "dwarkesh", reason: "upstream" },
    })
  })

  it("공식 URL 도메인에 맞는 전사 어댑터를 호출한다", async () => {
    const loadAiFrontierEpisode = vi.fn(async () =>
      official(aiFrontierEpisode, "AI Frontier transcript")
    )
    const loadDwarkeshEpisode = vi.fn(async () =>
      official(dwarkeshEpisode, "Dwarkesh transcript")
    )
    const dependencies = { loadAiFrontierEpisode, loadDwarkeshEpisode }

    await expect(fetchFrontierEpisode(
      aiFrontierEpisode.officialUrl,
      dependencies
    )).resolves.toEqual(official(aiFrontierEpisode, "AI Frontier transcript"))
    await expect(fetchFrontierEpisode(
      dwarkeshEpisode.officialUrl,
      dependencies
    )).resolves.toEqual(official(dwarkeshEpisode, "Dwarkesh transcript"))

    expect(loadAiFrontierEpisode).toHaveBeenCalledOnce()
    expect(loadDwarkeshEpisode).toHaveBeenCalledOnce()
  })

  it("등록되지 않은 전사 도메인은 거부한다", async () => {
    await expect(fetchFrontierEpisode(
      "https://example.com/episode",
      {
        loadAiFrontierEpisode: vi.fn(),
        loadDwarkeshEpisode: vi.fn(),
      }
    )).rejects.toBeInstanceOf(FrontierSourceError)
  })
})
