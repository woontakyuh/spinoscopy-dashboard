"use client"

// AI Frontier 통합 화면.
// index 요청과 뷰 상태만 여기서 들고, 목록 렌더링은 두 패널에 맡긴다.
// 필터/정렬/교차이동 규칙은 frontier-view의 순수 함수만 쓴다.

import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"

import type { AiFrontierConcept, AiFrontierEpisodeRef, AiFrontierIndex } from "@/lib/types/ai-frontier"
import type { AiFrontierSource } from "@/lib/types/ai-frontier-import"

import { ConceptsPane } from "./ConceptsPane"
import { EpisodesPane } from "./EpisodesPane"
import { FrontierPanel, FrontierSegments } from "./FrontierSegments"
import { FrontierSourceFilters } from "./FrontierSourceFilters"
import { FrontierIndexError, FrontierSkeletonColumns, FrontierSourceError } from "./FrontierSourceState"
import { FrontierStatusBar } from "./FrontierStatusBar"
import {
  episodeMatchesSourceFilter,
  filterFrontierIndexBySource,
  type FrontierSourceFilter,
} from "./frontier-source"
import {
  clearSelection,
  countConceptCategories,
  filterConcepts,
  filterEpisodes,
  followConceptRef,
  followEpisodeToConcept,
  initialFrontierViewState,
  setCategory,
  setMobileSection,
  setSearch,
  sortEpisodes,
  type FrontierMobileSection,
  type FrontierViewState,
} from "./frontier-view"

/** 방송은 하루 단위로 늘어난다. 10분 안에는 다시 물어볼 이유가 없다. */
const STALE_TIME = 10 * 60 * 1000

async function fetchFrontierIndex(): Promise<AiFrontierIndex> {
  const response = await fetch("/api/andrej/frontier")
  if (!response.ok) throw new Error(`frontier index ${response.status}`)
  return (await response.json()) as AiFrontierIndex
}

export function FrontierDashboard({
  source = "ai-frontier",
}: {
  readonly source?: AiFrontierSource
}) {
  const { data, dataUpdatedAt, isPending, isError, refetch } = useQuery({
    queryKey: ["andrej-frontier"],
    queryFn: fetchFrontierIndex,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
  })

  const [view, setView] = useState<FrontierViewState>(initialFrontierViewState)
  // 탭이 열어 준 소스에서 시작하고, 그 자리에서 `전체`로 넓힐 수 있다.
  const [sourceFilter, setSourceFilter] = useState<FrontierSourceFilter>(source)
  const [orphanRef, setOrphanRef] = useState<string | null>(null)
  const columnsRef = useRef<HTMLDivElement>(null)

  const { selectedEpisodeId, selectedConceptId } = view

  // Escape는 선택만 푼다. 검색어까지 지우면 스크롤 맥락을 잃는다.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      setView(clearSelection)
      setOrphanRef(null)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  // 교차 이동 후 목적지 줄에 초점을 옮겨, 어디로 왔는지 눈과 키보드 모두 알 수 있게 한다.
  useEffect(() => {
    const controls =
      selectedEpisodeId !== null
        ? `episode-detail-${selectedEpisodeId}`
        : selectedConceptId !== null
          ? `concept-detail-${selectedConceptId}`
          : null
    if (controls === null) return
    columnsRef.current?.querySelector<HTMLElement>(`[aria-controls="${controls}"]`)?.focus()
  }, [selectedEpisodeId, selectedConceptId])

  const sourceData = useMemo(
    () => data === undefined ? undefined : filterFrontierIndexBySource(data, sourceFilter),
    [data, sourceFilter]
  )

  // 개수는 검색·필터 이전의 index 기준이라, 한쪽을 골라도 다른 칩이 0으로 사라지지 않는다.
  const sourceCounts = useMemo<Record<FrontierSourceFilter, number>>(() => {
    const all = data?.episodes ?? []
    return {
      all: all.length,
      "ai-frontier": all.filter((episode) => episodeMatchesSourceFilter(episode, "ai-frontier")).length,
      dwarkesh: all.filter((episode) => episodeMatchesSourceFilter(episode, "dwarkesh")).length,
    }
  }, [data])
  const episodes = useMemo(() => sourceData?.episodes ?? [], [sourceData])
  const concepts = useMemo(() => sourceData?.concepts ?? [], [sourceData])

  const visibleEpisodes = useMemo(() => filterEpisodes(episodes, view.search), [episodes, view.search])
  const visibleConcepts = useMemo(
    () => filterConcepts(concepts, view.search, view.category),
    [concepts, view.search, view.category]
  )
  const categoryCounts = useMemo(() => countConceptCategories(concepts, view.search), [concepts, view.search])
  const latestEpisode = useMemo(() => sortEpisodes(episodes)[0], [episodes])

  function handleEpisodeNavigate(ref: AiFrontierEpisodeRef) {
    const result = followConceptRef(view, ref, episodes)
    setOrphanRef(result.kind === "unavailable" ? result.ref : null)
    setView(result.state)
  }

  function handleConceptNavigate(concept: AiFrontierConcept) {
    setOrphanRef(null)
    setView(followEpisodeToConcept(view, concept))
  }

  const retry = () => void refetch()

  if (isPending) return <FrontierSkeletonColumns />
  if (isError || data === undefined) return <FrontierIndexError source={source} onRetry={retry} />

  const counts: Record<FrontierMobileSection, number> = {
    episodes: visibleEpisodes.length,
    concepts: visibleConcepts.length,
  }

  return (
    <div className="space-y-3">
      <FrontierStatusBar
        latestEpisodeNumber={latestEpisode?.episodeNumber ?? null}
        episodeCount={episodes.length}
        conceptCount={concepts.length}
        unreviewedCount={episodes.filter((episode) => !episode.reviewed).length}
        syncedAt={dataUpdatedAt}
        partial={data.status !== "ok"}
        search={view.search}
        onSearchChange={(search) => setView(setSearch(view, search))}
      />

      <FrontierSourceFilters
        current={sourceFilter}
        counts={sourceCounts}
        onChange={(filter) => {
          // 필터 밖으로 밀려난 줄에 선택 표시만 남는 걸 막는다.
          setSourceFilter(filter)
          setView(clearSelection)
          setOrphanRef(null)
        }}
      />

      {orphanRef !== null && (
        <p
          data-testid="frontier-crosslink-unavailable"
          role="status"
          className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground"
        >
          {orphanRef} 에피소드는 현재 DB에 없어 이동하지 못했습니다.
        </p>
      )}

      <FrontierSegments
        current={view.mobileSection}
        counts={counts}
        onChange={(section) => setView(setMobileSection(view, section))}
      />

      <div ref={columnsRef} data-testid="frontier-columns" className="grid gap-3 md:grid-cols-2">
        <FrontierPanel section="episodes" current={view.mobileSection} targeted={selectedEpisodeId !== null}>
          {data.sources.episodes === "unavailable" ? (
            <FrontierSourceError section="episodes" onRetry={retry} />
          ) : (
            <EpisodesPane
              episodes={visibleEpisodes}
              concepts={concepts}
              selectedEpisodeId={selectedEpisodeId}
              onConceptNavigate={handleConceptNavigate}
              onEpisodeImported={() => refetch()}
            />
          )}
        </FrontierPanel>

        <FrontierPanel section="concepts" current={view.mobileSection} targeted={selectedConceptId !== null}>
          {data.sources.concepts === "unavailable" ? (
            <FrontierSourceError section="concepts" onRetry={retry} />
          ) : (
            <ConceptsPane
              concepts={visibleConcepts}
              episodes={data.episodes}
              categoryCounts={categoryCounts}
              currentCategory={view.category}
              selectedConceptId={selectedConceptId}
              onCategoryChange={(category) => setView(setCategory(view, category))}
              onEpisodeNavigate={handleEpisodeNavigate}
            />
          )}
        </FrontierPanel>
      </div>
    </div>
  )
}
