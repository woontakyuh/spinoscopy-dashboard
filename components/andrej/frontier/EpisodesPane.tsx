"use client"

// AI Frontier Episodes 목록 패널.
// 목록은 부모가 준 데이터만 그린다. 긴 본문은 Notion 원문으로 연결한다.

import { useState } from "react"

import type { AiFrontierConcept, AiFrontierEpisode } from "@/lib/types/ai-frontier"
import { cn } from "@/lib/utils"

import { EpisodeLinks } from "./EpisodeLinks"
import { conceptsForEpisode, sortEpisodes } from "./frontier-view"

export interface EpisodesPaneProps {
  readonly episodes: AiFrontierEpisode[]
  readonly concepts: AiFrontierConcept[]
  readonly selectedEpisodeId: string | null
  readonly onConceptNavigate: (concept: AiFrontierConcept) => void
}

const MAX_TOPICS = 2

function ConceptChips({
  episodeId,
  concepts,
  onNavigate,
}: {
  readonly episodeId: string
  readonly concepts: AiFrontierConcept[]
  readonly onNavigate: (concept: AiFrontierConcept) => void
}) {
  if (concepts.length === 0) return null

  return (
    <div data-testid={`frontier-episode-concepts-${episodeId}`} className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        관련 개념 <span className="num text-foreground/80">{concepts.length}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {concepts.map((concept) => {
          const korean = concept.korean?.trim() ?? ""
          return (
            <button
              key={concept.id}
              type="button"
              onClick={() => onNavigate(concept)}
              className="rounded-md border border-purple-400/35 bg-purple-500/10 px-2.5 py-1.5 text-left text-xs font-medium text-purple-800 transition-colors hover:border-purple-500/60 hover:bg-purple-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 dark:text-purple-100 dark:hover:border-purple-300/60"
            >
              {concept.term}
              {korean !== "" && <span className="ml-1.5 font-normal text-foreground/75">{korean}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function EpisodeRow({
  episode,
  linked,
  expanded,
  onToggle,
  onConceptNavigate,
}: {
  readonly episode: AiFrontierEpisode
  readonly linked: AiFrontierConcept[]
  readonly expanded: boolean
  readonly onToggle: () => void
  readonly onConceptNavigate: (concept: AiFrontierConcept) => void
}) {
  const regionId = `episode-detail-${episode.id}`
  const titleId = `episode-title-${episode.id}`
  const date = episode.published ?? episode.recorded
  const summary = episode.summary?.trim() ?? ""
  const topics = episode.topics.map((topic) => topic.trim()).filter((topic) => topic !== "")
  const hiddenTopics = topics.length - MAX_TOPICS

  return (
    <li
      data-testid={`frontier-episode-row-${episode.id}`}
      className={cn(
        "rounded-lg border bg-muted transition-colors",
        expanded ? "border-purple-400/35" : "border-border"
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={onToggle}
        className="w-full rounded-lg px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
      >
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {episode.episodeNumber !== null && (
            <span className="num rounded border border-purple-400/30 bg-purple-500/10 px-1.5 py-0.5 text-[11px] text-purple-700 dark:text-purple-200">
              EP{episode.episodeNumber}
            </span>
          )}
          <span id={titleId} className="text-sm font-semibold text-foreground">
            {episode.name}
          </span>
        </span>
      </button>

      {expanded && (
        <div
          id={regionId}
          role="region"
          aria-labelledby={titleId}
          className="space-y-3 border-t border-border px-3 py-3"
        >
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="num text-xs text-muted-foreground">{date ?? "날짜 미상"}</span>
              <span className={cn("text-[11px]", episode.reviewed ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>
                {episode.reviewed ? "검토 완료" : "미검토"}
              </span>
            </div>

            {summary !== "" && (
              <p
                data-testid={`frontier-episode-summary-${episode.id}`}
                className="text-xs leading-relaxed text-foreground/80"
              >
                {summary}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              {topics.length > 0 && (
                <span
                  data-testid={`frontier-episode-topics-${episode.id}`}
                  className="flex min-w-0 items-baseline gap-1.5"
                >
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    주제
                  </span>
                  <span className="truncate text-xs text-foreground/80">
                    {topics.slice(0, MAX_TOPICS).join(" · ")}
                  </span>
                  {hiddenTopics > 0 && <span className="num text-[11px] text-muted-foreground">+{hiddenTopics}</span>}
                </span>
              )}
              <span
                data-testid={`frontier-episode-concept-count-${episode.id}`}
                className="text-[11px] text-muted-foreground"
              >
                관련 개념 <span className="num text-foreground/80">{linked.length}</span>
              </span>
            </div>
          </div>
          <EpisodeLinks episode={episode} />
          <ConceptChips episodeId={episode.id} concepts={linked} onNavigate={onConceptNavigate} />
        </div>
      )}
    </li>
  )
}

export function EpisodesPane({ episodes, concepts, selectedEpisodeId, onConceptNavigate }: EpisodesPaneProps) {
  const [expandedId, setExpandedId] = useState<string | null>(selectedEpisodeId)
  const [syncedSelection, setSyncedSelection] = useState<string | null>(selectedEpisodeId)

  // cross-link으로 선택이 바뀌면 그 에피소드를 펼친 채로 보여준다(렌더 중 상태 조정).
  if (selectedEpisodeId !== syncedSelection) {
    setSyncedSelection(selectedEpisodeId)
    setExpandedId(selectedEpisodeId)
  }

  const ordered = sortEpisodes(episodes)

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">Episodes</h2>

      {ordered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          표시할 에피소드가 없습니다.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {ordered.map((episode) => (
            <EpisodeRow
              key={episode.id}
              episode={episode}
              linked={conceptsForEpisode(concepts, episode)}
              expanded={episode.id === expandedId}
              onToggle={() => setExpandedId((current) => (current === episode.id ? null : episode.id))}
              onConceptNavigate={onConceptNavigate}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
