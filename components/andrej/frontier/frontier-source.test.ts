import { describe, expect, it } from "vitest"

import type {
  AiFrontierConcept,
  AiFrontierEpisode,
  AiFrontierIndex,
} from "@/lib/types/ai-frontier"

import {
  FRONTIER_SOURCE_FILTERS,
  episodeMatchesSourceFilter,
  filterFrontierIndexBySource,
  frontierSourceFilterLabel,
  frontierSourceLabel,
  frontierTranscriptLinkLabel,
} from "./frontier-source"

const aiFrontierEpisode: AiFrontierEpisode = {
  id: "ep-110",
  name: "EP110. AI와 정렬",
  episodeNumber: 110,
  status: "완료",
  published: "2026-08-18",
  recorded: null,
  reviewed: false,
  topics: ["Alignment"],
  models: [],
  people: [],
  youtube: null,
  transcriptSource: "https://aifrontier.kr/ko/episodes/ep110",
  duration: null,
  summary: "AI Frontier 요약",
  keyTerms: [],
  source: "ai-frontier",
  sourceKey: "EP110",
  sourceIdentityPersisted: false,
}

const dwarkeshEpisode: AiFrontierEpisode = {
  id: "dwarkesh-ryan",
  name: "Ryan Greenblatt — AI R&D 자동화",
  episodeNumber: null,
  status: "완료",
  published: "2026-08-11",
  recorded: null,
  reviewed: false,
  topics: ["AI R&D"],
  models: [],
  people: ["Ryan Greenblatt"],
  youtube: null,
  transcriptSource: "https://www.dwarkesh.com/p/ryan-greenblatt",
  duration: null,
  summary: "Dwarkesh 요약",
  keyTerms: [],
  source: "dwarkesh",
  sourceKey: "DWARKESH:RYAN-GREENBLATT",
  sourceIdentityPersisted: true,
}

/**
 * index 는 JSON 경계를 넘어온다. union 밖 값이 실제로 도착할 수 있으므로
 * 그 경계를 그대로 재현한다(운영 코드에는 캐스트를 두지 않는다).
 */
function withRawSource(episode: AiFrontierEpisode, source: string): AiFrontierEpisode {
  const raw: unknown = { ...episode, source }
  return raw as AiFrontierEpisode
}

const legacyEpisode = withRawSource(
  {
    ...aiFrontierEpisode,
    id: "legacy-row",
    name: "출처가 사라진 옛 행",
    episodeNumber: null,
    published: "2026-08-15",
    sourceKey: null,
    transcriptSource: null,
  },
  "legacy-unknown"
)

const concepts: AiFrontierConcept[] = [
  {
    id: "concept-ai-frontier",
    term: "Alignment",
    korean: "정렬",
    category: "Safety",
    verified: "전사 기반",
    oneLine: null,
    intuition: null,
    whyItMatters: null,
    source: null,
    episodes: [{ ref: "EP110", available: true, pageId: "ep-110" }],
  },
  {
    id: "concept-dwarkesh",
    term: "Recursive Self-Improvement",
    korean: "재귀적 자기 개선",
    category: "Agent",
    verified: "전사 기반",
    oneLine: null,
    intuition: null,
    whyItMatters: null,
    source: null,
    episodes: [{
      ref: "DWARKESH:RYAN-GREENBLATT",
      available: true,
      pageId: "dwarkesh-ryan",
    }],
  },
]

const index: AiFrontierIndex = {
  status: "ok",
  sources: { episodes: "ok", concepts: "ok" },
  episodes: [aiFrontierEpisode, dwarkeshEpisode],
  concepts,
  episodeIndex: {
    EP110: "ep-110",
    "DWARKESH:RYAN-GREENBLATT": "dwarkesh-ryan",
  },
}

describe("Frontier source filtering", () => {
  it("제목/URL 이 아니라 저장된 source 로만 판별한다", () => {
    // 제목과 URL 은 Dwarkesh 를 가리키지만 저장된 source 는 ai-frontier 다.
    const contradictory: AiFrontierEpisode = {
      ...aiFrontierEpisode,
      id: "contradictory",
      name: "Dwarkesh · 제목만 Dwarkesh",
      transcriptSource: "https://www.dwarkesh.com/p/not-really",
      source: "ai-frontier",
    }

    expect(episodeMatchesSourceFilter(contradictory, "ai-frontier")).toBe(true)
    expect(episodeMatchesSourceFilter(contradictory, "dwarkesh")).toBe(false)
    expect(episodeMatchesSourceFilter(contradictory, "all")).toBe(true)

    // 반대 방향도 같다: 제목/URL 에 Dwarkesh 흔적이 없어도 저장된 source 를 따른다.
    const plainTitled: AiFrontierEpisode = {
      ...dwarkeshEpisode,
      name: "제목에 출처가 없다",
      transcriptSource: null,
    }
    expect(episodeMatchesSourceFilter(plainTitled, "dwarkesh")).toBe(true)
    expect(episodeMatchesSourceFilter(plainTitled, "ai-frontier")).toBe(false)
  })

  it("전체 필터는 세 가지뿐이고 사람이 읽는 이름을 가진다", () => {
    expect(FRONTIER_SOURCE_FILTERS).toEqual(["all", "ai-frontier", "dwarkesh"])
    expect(FRONTIER_SOURCE_FILTERS.map(frontierSourceFilterLabel)).toEqual([
      "전체",
      "AI Frontier",
      "Dwarkesh",
    ])
  })

  it("알 수 없는 source 는 안전한 일반 이름으로 읽힌다", () => {
    expect(frontierSourceLabel("ai-frontier")).toBe("AI Frontier")
    expect(frontierSourceLabel("dwarkesh")).toBe("Dwarkesh")
    expect(frontierSourceLabel(legacyEpisode.source)).toBe("기타 출처")

    expect(frontierTranscriptLinkLabel("ai-frontier")).toBe("AI Frontier에서 전사 읽기")
    expect(frontierTranscriptLinkLabel("dwarkesh")).toBe("Dwarkesh에서 전사 읽기")
    expect(frontierTranscriptLinkLabel(legacyEpisode.source)).toBe("공식 출처에서 전사 읽기")
  })

  it("알 수 없는 source 행은 전체에는 남고 소스별 필터에서만 빠진다", () => {
    const withLegacy: AiFrontierIndex = {
      ...index,
      episodes: [...index.episodes, legacyEpisode],
    }

    expect(filterFrontierIndexBySource(withLegacy, "all").episodes.map((e) => e.id)).toEqual([
      "ep-110",
      "dwarkesh-ryan",
      "legacy-row",
    ])
    expect(episodeMatchesSourceFilter(legacyEpisode, "all")).toBe(true)
    expect(episodeMatchesSourceFilter(legacyEpisode, "ai-frontier")).toBe(false)
    expect(episodeMatchesSourceFilter(legacyEpisode, "dwarkesh")).toBe(false)
  })

  it("전체 필터는 index 를 그대로 돌려준다", () => {
    expect(filterFrontierIndexBySource(index, "all")).toEqual(index)
  })

  it("선택한 소스의 Episode와 연결된 Concept만 남긴다", () => {
    expect(filterFrontierIndexBySource(index, "ai-frontier")).toEqual({
      ...index,
      episodes: [aiFrontierEpisode],
      concepts: [concepts[0]],
      episodeIndex: { EP110: "ep-110" },
    })
    expect(filterFrontierIndexBySource(index, "dwarkesh")).toEqual({
      ...index,
      episodes: [dwarkeshEpisode],
      concepts: [concepts[1]],
      episodeIndex: {
        "DWARKESH:RYAN-GREENBLATT": "dwarkesh-ryan",
      },
    })
  })
})
