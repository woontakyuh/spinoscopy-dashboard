// Frontier 소스 판별.
// 판별 근거는 Notion 에 저장된 `Source` 한 곳뿐이다. 제목 접두어나 URL 호스트로
// 추측하지 않는다 — 제목은 원본 그대로 두는 게 이 화면의 약속이라, 추측을 섞으면
// 제목만 Dwarkesh 를 닮은 AI Frontier 행이 반대편 탭으로 새어 나간다.

import type {
  AiFrontierEpisode,
  AiFrontierIndex,
} from "@/lib/types/ai-frontier"
import type { AiFrontierSource } from "@/lib/types/ai-frontier-import"

/** 목록 위 필터 한 줄. `all` 은 두 소스를 합쳐 보여준다. */
export type FrontierSourceFilter = "all" | AiFrontierSource

export const FRONTIER_SOURCE_FILTERS: readonly FrontierSourceFilter[] = [
  "all",
  "ai-frontier",
  "dwarkesh",
]

const SOURCE_LABEL: Record<AiFrontierSource, string> = {
  "ai-frontier": "AI Frontier",
  dwarkesh: "Dwarkesh",
}

/** 저장된 값이 union 밖일 때 쓰는 이름. 화면이 비어 보이지 않게 한다. */
const UNKNOWN_SOURCE_LABEL = "기타 출처"

/** 링크 문구는 출처를 단정할 수 없을 때 "공식 출처"로 물러선다. */
const UNKNOWN_SOURCE_LINK_LABEL = "공식 출처"

/**
 * index 는 JSON 경계를 넘어온다. 타입이 union 이라도 실제 값은 그 밖일 수 있어
 * 화면 쪽에서 한 번 더 확인한다.
 */
function isKnownSource(source: string): source is AiFrontierSource {
  return source === "ai-frontier" || source === "dwarkesh"
}

/** 줄 위에 붙는 짧은 출처 이름. */
export function frontierSourceLabel(source: string): string {
  return isKnownSource(source) ? SOURCE_LABEL[source] : UNKNOWN_SOURCE_LABEL
}

/** 필터 버튼에 붙는 이름. */
export function frontierSourceFilterLabel(filter: FrontierSourceFilter): string {
  return filter === "all" ? "전체" : SOURCE_LABEL[filter]
}

/** 공식 전사 링크가 어디로 가는지 소리 내어 알려 준다. */
export function frontierTranscriptLinkLabel(source: string): string {
  const label = isKnownSource(source) ? SOURCE_LABEL[source] : UNKNOWN_SOURCE_LINK_LABEL
  return `${label}에서 전사 읽기`
}

/**
 * 저장된 source 만 본다. 알 수 없는 값은 `전체`에서만 살아남는다 —
 * 목록에서 사라지는 것보다 낫고, 소스별 필터의 뜻을 흐리지도 않는다.
 */
export function episodeMatchesSourceFilter(
  episode: AiFrontierEpisode,
  filter: FrontierSourceFilter
): boolean {
  return filter === "all" || episode.source === filter
}

/**
 * 참조 문자열이 선 네임스페이스. `DWARKESH:` 만 명시적이고, 나머지는 AI Frontier 의
 * 레거시 `EPnn` 자리다. 숫자로 에피소드를 되찾는 길은 이 판별을 통과한 참조에만 열어 준다.
 */
export function frontierRefSource(ref: string): AiFrontierSource {
  return ref.trim().toUpperCase().startsWith("DWARKESH:") ? "dwarkesh" : "ai-frontier"
}

function refBelongsToSource(
  ref: string,
  source: AiFrontierSource
): boolean {
  return frontierRefSource(ref) === source
}

export function filterFrontierIndexBySource(
  index: AiFrontierIndex,
  filter: FrontierSourceFilter
): AiFrontierIndex {
  if (filter === "all") return index

  const episodes = index.episodes.filter((episode) =>
    episodeMatchesSourceFilter(episode, filter)
  )
  const episodeIds = new Set(episodes.map((episode) => episode.id))
  const episodeIndex = Object.fromEntries(
    Object.entries(index.episodeIndex).filter(
      ([ref, pageId]) =>
        episodeIds.has(pageId) || refBelongsToSource(ref, filter)
    )
  )
  const concepts = index.concepts.filter((concept) =>
    concept.episodes.some(
      (episode) =>
        (episode.pageId !== null && episodeIds.has(episode.pageId)) ||
        refBelongsToSource(episode.ref, filter)
    )
  )

  return { ...index, episodes, concepts, episodeIndex }
}
