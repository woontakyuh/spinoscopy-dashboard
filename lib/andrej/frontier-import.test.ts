import { describe, expect, it, vi } from "vitest"

import type { AiFrontierIndex } from "@/lib/types/ai-frontier"
import type {
  AiFrontierEpisodeAnalysis,
  AiFrontierImportResult,
  AiFrontierOfficialEpisode,
} from "@/lib/types/ai-frontier-import"

import {
  AiFrontierImportConflictError,
  AiFrontierImportError,
  importAiFrontierEpisode,
} from "./frontier-import"

const pageId = "3b2908af-25b9-8103-9425-d71f0a74404e"

const index: AiFrontierIndex = {
  status: "ok",
  sources: { episodes: "ok", concepts: "ok" },
  episodeIndex: { EP87: pageId },
  episodes: [{
    id: pageId,
    name: "EP87. 딸깍의 시대",
    episodeNumber: 87,
    status: "목록",
    published: "2026-02-24",
    recorded: null,
    reviewed: false,
    topics: [],
    models: [],
    people: [],
    youtube: "https://www.youtube.com/watch?v=abc",
    transcriptSource: "https://aifrontier.kr/ko/episodes/ep87",
    duration: "PT1H",
    summary: null,
    keyTerms: [],
    source: "ai-frontier",
    sourceKey: "EP87",
    sourceIdentityPersisted: false,
  }],
  concepts: [],
}

const officialEpisode = {
  source: "ai-frontier",
  reference: "EP87",
  episodeNumber: 87,
  name: "EP87. 딸깍의 시대",
  officialUrl: "https://aifrontier.kr/ko/episodes/ep87",
  published: "2026-02-24",
  duration: "PT1H",
  youtube: "https://www.youtube.com/watch?v=abc",
  summary: "공식 설명",
  transcript: "노정석: 전사",
} satisfies AiFrontierOfficialEpisode

const analysis = {
  summary: "요약",
  topics: ["Agent"],
  models: [],
  people: ["노정석"],
  concepts: [],
  keyPoints: [],
  insights: [],
  mentalModels: [],
  factInterpretation: [],
  questions: [],
} satisfies AiFrontierEpisodeAnalysis

const result = {
  pageId,
  reference: "EP87",
  episodeNumber: 87,
  status: "완료",
  conceptsCreated: 3,
  conceptsUpdated: 1,
} satisfies AiFrontierImportResult

function dependencies() {
  return {
    loadIndex: vi.fn(async () => index),
    loadEpisode: vi.fn<() => Promise<AiFrontierOfficialEpisode>>(
      async () => officialEpisode
    ),
    analyze: vi.fn(async () => analysis),
    persist: vi.fn(async () => result),
    setStatus: vi.fn(async () => undefined),
  }
}

describe("AI Frontier Episode import orchestration", () => {
  it("목록 Episode를 수집 중으로 바꾸고 전사·분석·저장을 순서대로 수행한다", async () => {
    const deps = dependencies()

    await expect(importAiFrontierEpisode(pageId, deps)).resolves.toEqual(result)

    expect(deps.setStatus).toHaveBeenNthCalledWith(1, pageId, "수집 중")
    expect(deps.loadEpisode).toHaveBeenCalledWith(
      "https://aifrontier.kr/ko/episodes/ep87"
    )
    expect(deps.analyze).toHaveBeenCalledWith(officialEpisode)
    expect(deps.persist).toHaveBeenCalledWith({
      pageId,
      episode: officialEpisode,
      analysis,
      existingConcepts: [],
    })
  })

  it("이미 완료된 Episode는 다시 수집하지 않는다", async () => {
    const deps = dependencies()
    deps.loadIndex.mockResolvedValue({
      ...index,
      episodes: [{ ...index.episodes[0]!, status: "완료" }],
    })

    await expect(importAiFrontierEpisode(pageId, deps))
      .rejects.toBeInstanceOf(AiFrontierImportConflictError)
    expect(deps.setStatus).not.toHaveBeenCalled()
  })

  it("분석 실패 시 수집 실패 상태로 남긴다", async () => {
    const deps = dependencies()
    deps.analyze.mockRejectedValue(new Error("provider down"))

    await expect(importAiFrontierEpisode(pageId, deps))
      .rejects.toBeInstanceOf(AiFrontierImportError)
    expect(deps.setStatus).toHaveBeenNthCalledWith(2, pageId, "수집 실패")
    expect(deps.persist).not.toHaveBeenCalled()
  })

  it("Episode 번호가 없어도 공식 URL이 다르면 수집을 거부한다", async () => {
    const deps = dependencies()
    deps.loadIndex.mockResolvedValue({
      ...index,
      episodes: [{
        ...index.episodes[0]!,
        episodeNumber: null,
        transcriptSource: "https://www.dwarkesh.com/p/ryan-greenblatt",
      }],
    })
    deps.loadEpisode.mockResolvedValue({
      ...officialEpisode,
      source: "dwarkesh",
      reference: "DWARKESH:OTHER",
      episodeNumber: null,
      officialUrl: "https://www.dwarkesh.com/p/other",
    })

    await expect(importAiFrontierEpisode(pageId, deps))
      .rejects.toBeInstanceOf(AiFrontierImportError)
    expect(deps.persist).not.toHaveBeenCalled()
  })
})
