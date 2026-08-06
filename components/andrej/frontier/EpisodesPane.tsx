"use client"

// AI Frontier Episodes 목록 패널.
// 목록은 부모가 준 데이터만 그린다. 긴 본문은 Notion 원문으로 연결한다.

import { useState } from "react"

import type { AiFrontierConcept, AiFrontierEpisode } from "@/lib/types/ai-frontier"
import { cn } from "@/lib/utils"

import { conceptsForEpisode, sortEpisodes } from "./frontier-view"

export interface EpisodesPaneProps {
  readonly episodes: AiFrontierEpisode[]
  readonly concepts: AiFrontierConcept[]
  readonly selectedEpisodeId: string | null
  readonly onConceptNavigate: (concept: AiFrontierConcept) => void
}

const MAX_TOPICS = 2

/** http(s)만 링크로 만든다. javascript: 같은 스킴은 링크가 아니라 글자로 남긴다. */
function safeHttpUrl(value: string | null): string | null {
  const candidate = (value ?? "").trim()
  if (candidate === "") return null
  try {
    const url = new URL(candidate)
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

function notionUrl(pageId: string): string {
  return `https://www.notion.so/${pageId.replace(/-/g, "")}`
}

const linkClass =
  "inline-flex min-h-9 items-center rounded-md border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"

function ExternalLink({
  href,
  label,
  primary = false,
}: {
  readonly href: string
  readonly label: string
  readonly primary?: boolean
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        linkClass,
        primary
          ? "border-purple-400/50 bg-purple-500/20 text-purple-100 hover:bg-purple-500/30"
          : "border-border bg-card text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800"
      )}
    >
      {label}
    </a>
  )
}

/** 대시보드는 출처와 연결만 정리하고, 긴 본문은 canonical source인 Notion에서 읽는다. */
function EpisodeDetail({ episode }: { readonly episode: AiFrontierEpisode }) {
  const youtube = safeHttpUrl(episode.youtube)
  const transcript = (episode.transcriptSource ?? "").trim()
  const transcriptHref = safeHttpUrl(episode.transcriptSource)

  return (
    <div
      data-testid={`frontier-episode-source-summary-${episode.id}`}
      className="rounded-lg border border-purple-400/25 bg-purple-500/[0.07] p-3"
    >
      <p className="text-sm font-semibold text-zinc-100">원문과 전체 정리</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-300">
        긴 본문은 Notion에서 읽고, 대시보드에서는 핵심 주제와 연결된 개념을 빠르게 확인하세요.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ExternalLink href={notionUrl(episode.id)} label="Notion에서 본문 읽기" primary />
        {youtube !== null && <ExternalLink href={youtube} label="YouTube 보기" />}
        {transcriptHref !== null && <ExternalLink href={transcriptHref} label="전사 원문 보기" />}
        {transcriptHref === null && transcript !== "" && (
          <span
            data-testid={`frontier-episode-transcript-${episode.id}`}
            className="text-xs text-zinc-400"
          >
            전사 출처: {transcript}
          </span>
        )}
      </div>
    </div>
  )
}

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
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
        관련 개념 <span className="num text-zinc-300">{concepts.length}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {concepts.map((concept) => {
          const korean = concept.korean?.trim() ?? ""
          return (
            <button
              key={concept.id}
              type="button"
              onClick={() => onNavigate(concept)}
              className="rounded-md border border-purple-400/35 bg-purple-500/10 px-2.5 py-1.5 text-left text-xs font-medium text-purple-100 transition-colors hover:border-purple-300/60 hover:bg-purple-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
            >
              {concept.term}
              {korean !== "" && <span className="ml-1.5 font-normal text-zinc-300">{korean}</span>}
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
            <span className="num rounded border border-purple-400/30 bg-purple-500/10 px-1.5 py-0.5 text-[11px] text-purple-200">
              EP{episode.episodeNumber}
            </span>
          )}
          <span id={titleId} className="text-sm font-semibold text-foreground">
            {episode.name}
          </span>
          <span className="num text-xs text-muted-foreground">{date ?? "날짜 미상"}</span>
          <span className={cn("text-[11px]", episode.reviewed ? "text-emerald-300" : "text-muted-foreground")}>
            {episode.reviewed ? "검토 완료" : "미검토"}
          </span>
        </span>

        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          {topics.length > 0 && (
            <span
              data-testid={`frontier-episode-topics-${episode.id}`}
              className="flex min-w-0 items-baseline gap-1.5"
            >
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                주제
              </span>
              <span className="truncate text-xs text-zinc-300">
                {topics.slice(0, MAX_TOPICS).join(" · ")}
              </span>
              {hiddenTopics > 0 && <span className="num text-[11px] text-zinc-400">+{hiddenTopics}</span>}
            </span>
          )}
          <span
            data-testid={`frontier-episode-concept-count-${episode.id}`}
            className="text-[11px] text-zinc-400"
          >
            관련 개념 <span className="num text-zinc-300">{linked.length}</span>
          </span>
        </span>
      </button>

      {expanded && (
        <div
          id={regionId}
          role="region"
          aria-labelledby={titleId}
          className="space-y-2 border-t border-border px-3 py-2"
        >
          <EpisodeDetail episode={episode} />
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
