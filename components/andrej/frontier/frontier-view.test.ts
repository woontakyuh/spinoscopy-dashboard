import { describe, expect, it } from "vitest"

import type { AiFrontierConcept, AiFrontierEpisode, AiFrontierEpisodeRef } from "@/lib/types/ai-frontier"

import {
  clearSearch,
  clearSelection,
  conceptsForEpisode,
  countConceptCategories,
  filterConcepts,
  filterEpisodes,
  followConceptRef,
  followEpisodeToConcept,
  initialFrontierViewState,
  normalizeSearchText,
  selectConcept,
  selectEpisode,
  setCategory,
  setMobileSection,
  setSearch,
  sortEpisodes,
} from "./frontier-view"

function makeEpisode(partial: Partial<AiFrontierEpisode> & { id: string }): AiFrontierEpisode {
  return {
    name: "",
    episodeNumber: null,
    status: null,
    published: null,
    recorded: null,
    reviewed: false,
    topics: [],
    models: [],
    people: [],
    youtube: null,
    transcriptSource: null,
    duration: null,
    summary: null,
    keyTerms: [],
    source: "ai-frontier",
    sourceKey: null,
    sourceIdentityPersisted: false,
    ...partial,
  }
}

function makeRef(partial: Partial<AiFrontierEpisodeRef> & { ref: string }): AiFrontierEpisodeRef {
  return { available: false, pageId: null, ...partial }
}

function makeConcept(partial: Partial<AiFrontierConcept> & { id: string }): AiFrontierConcept {
  return {
    term: "",
    korean: null,
    category: null,
    verified: null,
    oneLine: null,
    intuition: null,
    whyItMatters: null,
    source: null,
    episodes: [],
    ...partial,
  }
}

const ep12 = makeEpisode({
  id: "ep-12",
  name: "Transformer 이후의 확장",
  episodeNumber: 12,
  published: "2026-03-01",
  topics: ["스케일링"],
  models: ["GPT-4"],
  people: ["Andrej Karpathy"],
})

const ep11 = makeEpisode({
  id: "ep-11",
  name: "에이전트 루프",
  episodeNumber: 11,
  published: "2026-03-01",
  topics: ["agents"],
  models: [],
  people: ["Demis Hassabis"],
})

const ep10 = makeEpisode({
  id: "ep-10",
  name: "추론 시간 스케일링",
  episodeNumber: 10,
  published: "2026-01-15",
  topics: [],
  models: ["o3"],
  people: [],
})

const epUndated = makeEpisode({ id: "ep-99", name: "미공개 파일럿", episodeNumber: 99, published: null })

const episodes: AiFrontierEpisode[] = [ep10, epUndated, ep11, ep12]

const conceptAttention = makeConcept({
  id: "c-attention",
  term: "Attention",
  korean: "어텐션",
  category: "Architecture",
  oneLine: "입력 토큰 간 관련도를 가중치로 계산한다",
  episodes: [makeRef({ ref: "EP12", available: true, pageId: "ep-12" })],
})

const conceptRlhf = makeConcept({
  id: "c-rlhf",
  term: "RLHF",
  korean: "인간 피드백 강화학습",
  category: "Training",
  oneLine: "사람 선호로 정렬한다",
  episodes: [makeRef({ ref: "EP11", available: true, pageId: "ep-11" })],
})

const conceptOrphan = makeConcept({
  id: "c-orphan",
  term: "Mixture of Experts",
  korean: "전문가 혼합",
  category: "Architecture",
  oneLine: "일부 전문가만 활성화한다",
  episodes: [makeRef({ ref: "EP45" })],
})

const concepts: AiFrontierConcept[] = [conceptAttention, conceptRlhf, conceptOrphan]

describe("normalizeSearchText", () => {
  it("NFKC 정규화 + 소문자화로 전각/대소문자 차이를 흡수한다", () => {
    expect(normalizeSearchText("ＧＰＴ")).toBe(normalizeSearchText("gpt"))
    expect(normalizeSearchText("  Transformer  ")).toBe("transformer")
  })

  it("분해된 한글 자모를 조합형과 동일하게 취급한다", () => {
    const decomposed = "어텐션".normalize("NFD")
    expect(decomposed).not.toBe("어텐션")
    expect(normalizeSearchText(decomposed)).toBe(normalizeSearchText("어텐션"))
  })
})

describe("sortEpisodes", () => {
  it("published 내림차순 + 같은 날짜는 에피소드 번호 내림차순, 날짜 없음은 뒤로 보낸다", () => {
    expect(sortEpisodes(episodes).map((e) => e.id)).toEqual(["ep-12", "ep-11", "ep-10", "ep-99"])
  })

  it("입력 배열을 변형하지 않고 반복 호출에도 순서가 안정적이다", () => {
    const first = sortEpisodes(episodes).map((e) => e.id)
    expect(sortEpisodes(sortEpisodes(episodes)).map((e) => e.id)).toEqual(first)
    expect(episodes.map((e) => e.id)).toEqual(["ep-10", "ep-99", "ep-11", "ep-12"])
  })
})

describe("filterEpisodes", () => {
  it("빈/공백 검색어는 전체를 안정 정렬 순서로 돌려준다", () => {
    expect(filterEpisodes(episodes, "   ").map((e) => e.id)).toEqual(["ep-12", "ep-11", "ep-10", "ep-99"])
  })

  it("제목/토픽/모델/인물을 대소문자 무시하고 검색한다", () => {
    expect(filterEpisodes(episodes, "TRANSFORMER").map((e) => e.id)).toEqual(["ep-12"])
    expect(filterEpisodes(episodes, "스케일링").map((e) => e.id)).toEqual(["ep-12", "ep-10"])
    expect(filterEpisodes(episodes, "ｇｐｔ-4").map((e) => e.id)).toEqual(["ep-12"])
    expect(filterEpisodes(episodes, "hassabis").map((e) => e.id)).toEqual(["ep-11"])
  })

  it("Concepts 전용 필드(one-line)로는 매칭되지 않는다", () => {
    expect(filterEpisodes(episodes, "가중치")).toEqual([])
  })

  it("제목 접두어 없이도 출처 이름으로 검색된다", () => {
    // 원본 제목에 "Dwarkesh" 가 한 글자도 없는 행.
    const dwarkesh = makeEpisode({
      id: "dwarkesh-ryan",
      name: "Ryan Greenblatt — AI R&D 자동화",
      published: "2026-02-01",
      source: "dwarkesh",
      sourceKey: "DWARKESH:RYAN-GREENBLATT",
    })

    expect(filterEpisodes([...episodes, dwarkesh], "dwarkesh").map((e) => e.id)).toEqual(["dwarkesh-ryan"])
    expect(filterEpisodes([...episodes, dwarkesh], "AI Frontier").map((e) => e.id)).toEqual([
      "ep-12",
      "ep-11",
      "ep-10",
      "ep-99",
    ])
  })
})

describe("filterConcepts", () => {
  it("term/Korean/category/oneLine을 검색한다", () => {
    expect(filterConcepts(concepts, "rlhf", null).map((c) => c.id)).toEqual(["c-rlhf"])
    expect(filterConcepts(concepts, "어텐션".normalize("NFD"), null).map((c) => c.id)).toEqual(["c-attention"])
    expect(filterConcepts(concepts, "architecture", null).map((c) => c.id)).toEqual(["c-attention", "c-orphan"])
    expect(filterConcepts(concepts, "선호", null).map((c) => c.id)).toEqual(["c-rlhf"])
  })

  it("카테고리 필터는 검색과 함께 적용된다", () => {
    expect(filterConcepts(concepts, "", "Architecture").map((c) => c.id)).toEqual(["c-attention", "c-orphan"])
    expect(filterConcepts(concepts, "전문가", "Architecture").map((c) => c.id)).toEqual(["c-orphan"])
    expect(filterConcepts(concepts, "", "Training").map((c) => c.id)).toEqual(["c-rlhf"])
  })
})

describe("countConceptCategories", () => {
  it("검색 결과 기준으로 카테고리별 개수를 세고, 카테고리 필터 자체에는 영향받지 않는다", () => {
    expect(countConceptCategories(concepts, "")).toEqual([
      { category: "Architecture", count: 2 },
      { category: "Training", count: 1 },
    ])
    expect(countConceptCategories(concepts, "전문가")).toEqual([{ category: "Architecture", count: 1 }])
  })
})

describe("cross-link navigation", () => {
  it("Concept → Episode 이동 시 Episode를 선택하고 mobile 섹션을 전환한다", () => {
    const state = setMobileSection(initialFrontierViewState, "concepts")
    const result = followConceptRef(state, conceptAttention.episodes[0], episodes)

    expect(result.kind).toBe("episode")
    if (result.kind !== "episode") return
    expect(result.episode.id).toBe("ep-12")
    expect(result.state.selectedEpisodeId).toBe("ep-12")
    expect(result.state.mobileSection).toBe("episodes")
  })

  it("orphan EP45는 unavailable 결과를 주고 선택 상태를 바꾸지 않는다", () => {
    const state = setSearch(initialFrontierViewState, "전문가")
    const result = followConceptRef(state, conceptOrphan.episodes[0], episodes)

    expect(result.kind).toBe("unavailable")
    if (result.kind !== "unavailable") return
    expect(result.ref).toBe("EP45")
    expect(result.state).toEqual(state)
  })

  it("available이지만 인덱스에 없는 pageId도 unavailable로 처리한다", () => {
    const ghost = makeRef({ ref: "EP77", available: true, pageId: "ep-77" })
    expect(followConceptRef(initialFrontierViewState, ghost, episodes).kind).toBe("unavailable")
  })

  it("Episode → Concept 이동 후에도 반대편 전체 목록이 필터되지 않는다", () => {
    const searched = setSearch(initialFrontierViewState, "TRANSFORMER")
    const next = followEpisodeToConcept(searched, conceptAttention)

    expect(next.selectedConceptId).toBe("c-attention")
    expect(next.mobileSection).toBe("concepts")
    expect(next.search).toBe("")
    expect(next.category).toBeNull()
    expect(filterEpisodes(episodes, next.search).map((e) => e.id)).toEqual(["ep-12", "ep-11", "ep-10", "ep-99"])
    expect(filterConcepts(concepts, next.search, next.category)).toHaveLength(3)
  })

  it("Concept → Episode 이동도 반대편 목록을 숨기지 않는다", () => {
    const filtered = setCategory(setSearch(initialFrontierViewState, "어텐션"), "Architecture")
    const result = followConceptRef(filtered, conceptAttention.episodes[0], episodes)

    if (result.kind !== "episode") throw new Error("expected episode cross-link")
    expect(result.state.search).toBe("")
    expect(result.state.category).toBeNull()
    expect(filterConcepts(concepts, result.state.search, result.state.category)).toHaveLength(3)
  })

  it("에피소드에 연결된 Concept 목록은 검색과 무관하게 전체를 준다", () => {
    expect(conceptsForEpisode(concepts, ep12).map((c) => c.id)).toEqual(["c-attention"])
    expect(conceptsForEpisode(concepts, epUndated)).toEqual([])
  })
})

describe("소스 네임스페이스 밖 숫자 되돌리기", () => {
  // 슬러그 끝의 숫자를 EP 번호로 읽으면 남의 소스 에피소드에 붙는다.
  const sholto2 = makeRef({ ref: "DWARKESH:SHOLTO-2" })
  const patel10 = makeRef({ ref: "DWARKESH:PATEL-10" })
  const ep2 = makeEpisode({ id: "ep-2", name: "합성 EP2", episodeNumber: 2, published: "2026-02-01" })
  const dwarkeshEpisode = makeEpisode({
    id: "dwarkesh-ryan",
    name: "Ryan Greenblatt — AI R&D 자동화",
    episodeNumber: null,
    published: "2026-02-10",
    source: "dwarkesh",
    sourceKey: "DWARKESH:RYAN-GREENBLATT",
    sourceIdentityPersisted: true,
  })
  const mixed = [...episodes, ep2, dwarkeshEpisode]

  it("DWARKESH 참조의 숫자는 AI Frontier EP 번호로 읽지 않는다", () => {
    expect(followConceptRef(initialFrontierViewState, sholto2, mixed).kind).toBe("unavailable")
    expect(followConceptRef(initialFrontierViewState, patel10, mixed).kind).toBe("unavailable")
  })

  it("해석되지 않은 Dwarkesh 참조는 AI Frontier 에피소드의 개념 목록에 섞이지 않는다", () => {
    const dwarkeshConcept = makeConcept({
      id: "c-dwarkesh",
      term: "Continual Learning",
      episodes: [sholto2, patel10],
    })

    expect(conceptsForEpisode([dwarkeshConcept], ep2)).toEqual([])
    expect(conceptsForEpisode([dwarkeshConcept], ep10)).toEqual([])
  })

  it("pageId 로 이어진 Dwarkesh 참조는 그대로 해석된다", () => {
    const linked = makeRef({ ref: "DWARKESH:RYAN-GREENBLATT", available: true, pageId: "dwarkesh-ryan" })
    const result = followConceptRef(initialFrontierViewState, linked, mixed)

    expect(result.kind).toBe("episode")
    if (result.kind !== "episode") return
    expect(result.episode.id).toBe("dwarkesh-ryan")
  })

  it("AI Frontier EP 참조의 숫자 되돌리기는 그대로 살아 있다", () => {
    const legacyTwo = followConceptRef(initialFrontierViewState, makeRef({ ref: "EP2" }), mixed)
    const legacyTen = followConceptRef(initialFrontierViewState, makeRef({ ref: "EP10" }), mixed)

    expect(legacyTwo.kind).toBe("episode")
    if (legacyTwo.kind !== "episode") return
    expect(legacyTwo.episode.id).toBe("ep-2")
    expect(legacyTen.kind).toBe("episode")
    if (legacyTen.kind !== "episode") return
    expect(legacyTen.episode.id).toBe("ep-10")
    expect(conceptsForEpisode([makeConcept({ id: "c-ep2", episodes: [makeRef({ ref: "EP2" })] })], ep2)).toHaveLength(1)
  })
})

describe("selection state", () => {
  it("clearSelection은 선택만 비우고 검색/카테고리는 유지한다", () => {
    const state = setCategory(setSearch({ ...initialFrontierViewState, selectedEpisodeId: "ep-12", selectedConceptId: "c-attention" }, "rlhf"), "Training")
    const cleared = clearSelection(state)

    expect(cleared.selectedEpisodeId).toBeNull()
    expect(cleared.selectedConceptId).toBeNull()
    expect(cleared.search).toBe("rlhf")
    expect(cleared.category).toBe("Training")
  })

  it("clearSearch는 검색/카테고리를 비워 안정 정렬 전체 목록을 복원한다", () => {
    const state = setCategory(setSearch(initialFrontierViewState, "rlhf"), "Training")
    const cleared = clearSearch(state)

    expect(filterEpisodes(episodes, cleared.search).map((e) => e.id)).toEqual(["ep-12", "ep-11", "ep-10", "ep-99"])
    expect(filterConcepts(concepts, cleared.search, cleared.category)).toHaveLength(3)
  })

  it("selectEpisode는 선택한 에피소드를 설정하고 개념 선택을 지운다", () => {
    const stateWithConcept = { ...initialFrontierViewState, selectedConceptId: "c-attention" }
    const selected = selectEpisode(stateWithConcept, "ep-12")

    expect(selected.selectedEpisodeId).toBe("ep-12")
    expect(selected.selectedConceptId).toBeNull()
  })

  it("selectConcept는 선택한 개념을 설정하고 에피소드 선택을 지운다", () => {
    const stateWithEpisode = { ...initialFrontierViewState, selectedEpisodeId: "ep-12" }
    const selected = selectConcept(stateWithEpisode, "c-attention")

    expect(selected.selectedConceptId).toBe("c-attention")
    expect(selected.selectedEpisodeId).toBeNull()
  })

  it("followConceptRef는 에피소드를 선택하고 개념 선택을 지운다", () => {
    const stateWithConcept = { ...initialFrontierViewState, selectedConceptId: "c-attention" }
    const result = followConceptRef(stateWithConcept, conceptAttention.episodes[0], episodes)

    expect(result.kind).toBe("episode")
    if (result.kind !== "episode") return
    expect(result.state.selectedEpisodeId).toBe("ep-12")
    expect(result.state.selectedConceptId).toBeNull()
  })

  it("followEpisodeToConcept는 개념을 선택하고 에피소드 선택을 지운다", () => {
    const stateWithEpisode = { ...initialFrontierViewState, selectedEpisodeId: "ep-12" }
    const result = followEpisodeToConcept(stateWithEpisode, conceptAttention)

    expect(result.selectedConceptId).toBe("c-attention")
    expect(result.selectedEpisodeId).toBeNull()
  })

  it("회귀: Concept→Episode→Concept 선택 체인은 마지막 Concept만 유지한다", () => {
    const initial = selectConcept(initialFrontierViewState, "c-rlhf")
    expect(initial.selectedConceptId).toBe("c-rlhf")
    expect(initial.selectedEpisodeId).toBeNull()

    const followResult = followConceptRef(initial, conceptRlhf.episodes[0], episodes)
    expect(followResult.kind).toBe("episode")
    if (followResult.kind !== "episode") return
    expect(followResult.state.selectedEpisodeId).toBe("ep-11")
    expect(followResult.state.selectedConceptId).toBeNull()

    const final = selectConcept(followResult.state, "c-attention")
    expect(final.selectedConceptId).toBe("c-attention")
    expect(final.selectedEpisodeId).toBeNull()
  })
})
