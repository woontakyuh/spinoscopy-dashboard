// AI Frontier 뷰 상태 계산기.
// 순수 함수만 두고 React/Notion 의존성을 갖지 않는다. UI는 이 결과를 렌더링만 한다.

import type { AiFrontierConcept, AiFrontierEpisode, AiFrontierEpisodeRef } from "@/lib/types/ai-frontier"

/** 모바일에서 한 번에 한쪽 목록만 보여줄 때 활성 섹션 */
export type FrontierMobileSection = "episodes" | "concepts"

export interface FrontierViewState {
  /** 선택된 Episode page id */
  selectedEpisodeId: string | null
  /** 선택된 Concept page id */
  selectedConceptId: string | null
  /** 양쪽 목록에 공유되는 검색어 (원문 보존, 비교 시에만 정규화) */
  search: string
  /** Concepts 전용 카테고리 필터 */
  category: string | null
  mobileSection: FrontierMobileSection
}

export interface FrontierCategoryCount {
  category: string
  count: number
}

/** Concept의 에피소드 참조를 따라간 결과 */
export type FrontierCrossLinkResult =
  | { kind: "episode"; episode: AiFrontierEpisode; state: FrontierViewState }
  | { kind: "unavailable"; ref: string; state: FrontierViewState }

export const initialFrontierViewState: FrontierViewState = {
  selectedEpisodeId: null,
  selectedConceptId: null,
  search: "",
  category: null,
  mobileSection: "episodes",
}

/**
 * 검색 비교용 정규화. NFKC로 전각/호환 문자를 접고, 한글 분해형(NFD)도 조합형으로 합친 뒤
 * 소문자 + trim 한다.
 */
export function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLowerCase().trim()
}

function matchesAny(needle: string, haystack: (string | null)[]): boolean {
  return haystack.some((field) => field !== null && normalizeSearchText(field).includes(needle))
}

function publishedRank(episode: AiFrontierEpisode): string {
  // 날짜 없는 에피소드는 항상 뒤로. ISO 문자열은 사전순 = 시간순이라 그대로 비교한다.
  return episode.published ?? ""
}

function episodeNumberRank(episode: AiFrontierEpisode): number {
  return episode.episodeNumber ?? Number.NEGATIVE_INFINITY
}

/**
 * published 내림차순 → 같은 날짜면 Episode 번호 내림차순 → 원본 순서로 안정 정렬.
 * 입력 배열은 변형하지 않는다.
 */
export function sortEpisodes(episodes: AiFrontierEpisode[]): AiFrontierEpisode[] {
  return episodes
    .map((episode, index) => ({ episode, index }))
    .sort((a, b) => {
      const dateDiff = publishedRank(b.episode).localeCompare(publishedRank(a.episode))
      if (dateDiff !== 0) return dateDiff

      const numberDiff = episodeNumberRank(b.episode) - episodeNumberRank(a.episode)
      if (numberDiff !== 0 && Number.isFinite(numberDiff)) return numberDiff

      return a.index - b.index
    })
    .map((entry) => entry.episode)
}

/** Episodes 검색: 제목/토픽/모델/인물. 빈 검색어면 전체를 안정 정렬로 돌려준다. */
export function filterEpisodes(episodes: AiFrontierEpisode[], search: string): AiFrontierEpisode[] {
  const needle = normalizeSearchText(search)
  if (needle === "") return sortEpisodes(episodes)

  const matched = episodes.filter((episode) =>
    matchesAny(needle, [episode.name, ...episode.topics, ...episode.models, ...episode.people])
  )
  return sortEpisodes(matched)
}

function conceptMatchesSearch(concept: AiFrontierConcept, needle: string): boolean {
  if (needle === "") return true
  return matchesAny(needle, [concept.term, concept.korean, concept.category, concept.oneLine])
}

/** Concepts 검색(term/Korean/category/one-line) + 카테고리 필터. 원본 순서를 유지한다. */
export function filterConcepts(
  concepts: AiFrontierConcept[],
  search: string,
  category: string | null
): AiFrontierConcept[] {
  const needle = normalizeSearchText(search)
  return concepts.filter((concept) => {
    if (category !== null && concept.category !== category) return false
    return conceptMatchesSearch(concept, needle)
  })
}

/**
 * 카테고리 칩에 붙일 개수. 검색 결과에는 반응하되 선택된 카테고리 필터에는 반응하지 않는다
 * (필터를 걸어도 다른 카테고리 칩이 0으로 사라지지 않도록).
 */
export function countConceptCategories(concepts: AiFrontierConcept[], search: string): FrontierCategoryCount[] {
  const needle = normalizeSearchText(search)
  const counts = new Map<string, number>()

  for (const concept of concepts) {
    if (concept.category === null) continue
    if (!conceptMatchesSearch(concept, needle)) continue
    counts.set(concept.category, (counts.get(concept.category) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => a.category.localeCompare(b.category))
}

/** "EP12" → 12. 숫자를 못 뽑으면 null. */
function refEpisodeNumber(ref: string): number | null {
  const match = /(\d+)/.exec(normalizeSearchText(ref))
  return match === null ? null : Number.parseInt(match[1], 10)
}

/**
 * multi_select 문자열 참조를 실제 Episode로 해석한다.
 * pageId 우선, 끊겼으면 "EPnn" 번호로 재시도한다. 둘 다 실패하면 orphan.
 */
function resolveEpisodeRef(ref: AiFrontierEpisodeRef, episodes: AiFrontierEpisode[]): AiFrontierEpisode | null {
  if (ref.pageId !== null) {
    const byId = episodes.find((episode) => episode.id === ref.pageId)
    if (byId !== undefined) return byId
  }

  const number = refEpisodeNumber(ref.ref)
  if (number === null) return null
  return episodes.find((episode) => episode.episodeNumber === number) ?? null
}

/**
 * cross-link 이동 시 반대편 목록이 검색/필터로 잘려 보이지 않도록 검색 상태를 비운다.
 * 목적지를 열었는데 그 목록에 목적지가 없는 상황을 막기 위한 규칙이다.
 */
function focusSection(state: FrontierViewState, section: FrontierMobileSection): FrontierViewState {
  return { ...state, search: "", category: null, mobileSection: section }
}

/** Concept → Episode. 해석 실패(orphan EP45 등)면 상태를 그대로 두고 unavailable을 알린다. */
export function followConceptRef(
  state: FrontierViewState,
  ref: AiFrontierEpisodeRef,
  episodes: AiFrontierEpisode[]
): FrontierCrossLinkResult {
  const episode = resolveEpisodeRef(ref, episodes)
  if (episode === null) return { kind: "unavailable", ref: ref.ref, state }

  return {
    kind: "episode",
    episode,
    state: { ...focusSection(state, "episodes"), selectedEpisodeId: episode.id, selectedConceptId: null },
  }
}

/** Episode → Concept. */
export function followEpisodeToConcept(state: FrontierViewState, concept: AiFrontierConcept): FrontierViewState {
  return { ...focusSection(state, "concepts"), selectedConceptId: concept.id, selectedEpisodeId: null }
}

/** 특정 Episode를 참조하는 Concept 전체. 검색/카테고리 필터를 적용하지 않는다. */
export function conceptsForEpisode(
  concepts: AiFrontierConcept[],
  episode: AiFrontierEpisode
): AiFrontierConcept[] {
  return concepts.filter((concept) =>
    concept.episodes.some((ref) => {
      if (ref.pageId !== null && ref.pageId === episode.id) return true
      const number = refEpisodeNumber(ref.ref)
      return number !== null && episode.episodeNumber !== null && number === episode.episodeNumber
    })
  )
}

export function setSearch(state: FrontierViewState, search: string): FrontierViewState {
  return { ...state, search }
}

export function setCategory(state: FrontierViewState, category: string | null): FrontierViewState {
  return { ...state, category }
}

export function setMobileSection(state: FrontierViewState, mobileSection: FrontierMobileSection): FrontierViewState {
  return { ...state, mobileSection }
}

export function selectEpisode(state: FrontierViewState, episodeId: string | null): FrontierViewState {
  return { ...state, selectedEpisodeId: episodeId, selectedConceptId: null }
}

export function selectConcept(state: FrontierViewState, conceptId: string | null): FrontierViewState {
  return { ...state, selectedConceptId: conceptId, selectedEpisodeId: null }
}

/** 선택만 해제. 검색/카테고리는 유지해 목록 스크롤 맥락을 잃지 않는다. */
export function clearSelection(state: FrontierViewState): FrontierViewState {
  return { ...state, selectedEpisodeId: null, selectedConceptId: null }
}

/** 검색/카테고리만 초기화해 안정 정렬 전체 목록을 복원한다. */
export function clearSearch(state: FrontierViewState): FrontierViewState {
  return { ...state, search: "", category: null }
}
