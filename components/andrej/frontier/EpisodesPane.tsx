"use client"

// AI Frontier Episodes 목록 패널.
// 목록은 부모가 준 데이터만 그린다. 본문(blocks)은 펼친 줄에서만 지연 로딩한다.

import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import type { AiFrontierConcept, AiFrontierEpisode, AiFrontierEpisodeDetail } from "@/lib/types/ai-frontier"
import { cn } from "@/lib/utils"

import { conceptsForEpisode, sortEpisodes } from "./frontier-view"

export interface EpisodesPaneProps {
  readonly episodes: AiFrontierEpisode[]
  readonly concepts: AiFrontierConcept[]
  readonly selectedEpisodeId: string | null
  readonly onConceptNavigate: (concept: AiFrontierConcept) => void
}

/** 한 화면에 밀어 넣을 수 있는 본문 상한. 넘으면 잘렸다고 표시한다. */
const MAX_BLOCKS = 40
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

async function fetchEpisodeDetail(pageId: string): Promise<AiFrontierEpisodeDetail> {
  const response = await fetch(`/api/andrej/frontier/episodes/${encodeURIComponent(pageId)}`)
  if (!response.ok) throw new Error(`episode detail ${response.status}`)
  return (await response.json()) as AiFrontierEpisodeDetail
}

const linkClass =
  "rounded border border-border bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"

function ExternalLink({ href, label }: { readonly href: string; readonly label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className={linkClass}>
      {label}
    </a>
  )
}

/** 펼쳤을 때만 마운트된다. 즉 이 컴포넌트의 존재 자체가 "펼침 후 요청" 규칙이다. */
function EpisodeDetail({ episode }: { readonly episode: AiFrontierEpisode }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["andrej-frontier-episode", episode.id],
    queryFn: () => fetchEpisodeDetail(episode.id),
    // 지난 방송 본문은 바뀌지 않는다. 다시 펼칠 때 재요청하지 않도록 stale 처리를 끈다.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

  if (isPending) {
    return <p className="text-xs text-muted-foreground">본문을 불러오는 중…</p>
  }

  if (isError || data === undefined) {
    // 본문만 실패한 것이므로 목록은 그대로 쓸 수 있게 이 줄 안에서만 알린다.
    return <p className="text-xs text-red-300">본문을 불러오지 못했습니다.</p>
  }

  const youtube = safeHttpUrl(data.youtube)
  const transcript = (data.transcriptSource ?? "").trim()
  const transcriptHref = safeHttpUrl(data.transcriptSource)
  const blocks = data.blocks.slice(0, MAX_BLOCKS)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <ExternalLink href={notionUrl(data.id)} label="Notion" />
        {youtube !== null && <ExternalLink href={youtube} label="YouTube" />}
        {transcriptHref !== null && <ExternalLink href={transcriptHref} label="전사 원문" />}
        {transcriptHref === null && transcript !== "" && (
          <span
            data-testid={`frontier-episode-transcript-${data.id}`}
            className="rounded border border-border bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground"
          >
            전사 출처: {transcript}
          </span>
        )}
      </div>

      {blocks.length > 0 && (
        <div className="space-y-1">
          {blocks.map((block) => (
            <p
              key={block.id}
              data-testid={`frontier-episode-block-${block.id}`}
              className="text-xs leading-relaxed text-foreground/90"
            >
              {block.text}
            </p>
          ))}
        </div>
      )}

      {(data.truncated || data.blocks.length > MAX_BLOCKS) && (
        <p
          data-testid={`frontier-episode-truncated-${data.id}`}
          className="text-[11px] text-muted-foreground"
        >
          본문이 길어 일부만 표시했습니다. 전체는 Notion에서 확인하세요.
        </p>
      )}
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
    <div data-testid={`frontier-episode-concepts-${episodeId}`} className="flex flex-wrap gap-1.5">
      {concepts.map((concept) => (
        <button
          key={concept.id}
          type="button"
          onClick={() => onNavigate(concept)}
          className="rounded-full border border-purple-400/40 bg-purple-500/10 px-2.5 py-1 text-xs text-purple-200 transition-colors hover:bg-purple-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
        >
          {concept.term}
        </button>
      ))}
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
  const hiddenTopics = episode.topics.length - MAX_TOPICS

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
          {episode.topics.length > 0 && (
            <span
              data-testid={`frontier-episode-topics-${episode.id}`}
              className="flex flex-wrap items-center gap-1.5"
            >
              {episode.topics.slice(0, MAX_TOPICS).map((topic) => (
                <span
                  key={topic}
                  className="rounded border border-border bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground"
                >
                  {topic}
                </span>
              ))}
              {hiddenTopics > 0 && <span className="num text-[11px] text-muted-foreground">+{hiddenTopics}</span>}
            </span>
          )}
          <span
            data-testid={`frontier-episode-concept-count-${episode.id}`}
            className="text-[11px] text-muted-foreground"
          >
            Concepts <span className="num">{linked.length}</span>
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
          <ConceptChips episodeId={episode.id} concepts={linked} onNavigate={onConceptNavigate} />
          <EpisodeDetail episode={episode} />
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
