import type { AiFrontierConcept, AiFrontierEpisode } from "@/lib/types/ai-frontier"
import { cn } from "@/lib/utils"

import { frontierSourceLabel } from "./frontier-source"
import { resolveEpisodeRef } from "./frontier-view"

function safeHttpUrl(value: string | null): string | null {
  const candidate = value?.trim() ?? ""
  if (candidate === "") return null
  try {
    const url = new URL(candidate)
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * 참조 해석은 목록 쪽과 같은 규칙(frontier-view)을 그대로 쓴다.
 * 여기서 따로 숫자를 뽑으면 `DWARKESH:...-2` 가 AI Frontier EP2 영상을 빌려 온다.
 */
function relatedVideos(concept: AiFrontierConcept, episodes: AiFrontierEpisode[]) {
  const seen = new Set<string>()

  return concept.episodes.flatMap((ref) => {
    const episode = resolveEpisodeRef(ref, episodes)
    if (episode === null || seen.has(episode.id)) return []
    const href = safeHttpUrl(episode.youtube)
    if (href === null) return []
    seen.add(episode.id)
    return [{ episode, href }]
  })
}

export function ConceptVideos({
  concept,
  episodes,
}: {
  readonly concept: AiFrontierConcept
  readonly episodes: AiFrontierEpisode[]
}) {
  const videos = relatedVideos(concept, episodes)
  if (videos.length === 0) return null

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        관련 영상 <span className="num text-foreground/80">{videos.length}</span>
      </p>
      <div className="space-y-1">
        {videos.map(({ episode, href }) => {
          // 번호가 없는 행(Dwarkesh)에 맨 "EP" 를 남기면 아무 것도 가리키지 않는 배지가 된다.
          const numbered = episode.episodeNumber !== null
          const label = numbered ? `EP${episode.episodeNumber}` : frontierSourceLabel(episode.source)
          return (
            <a
              key={episode.id}
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`${label} ${episode.name} 영상 보기`}
              className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-xs text-foreground transition-colors hover:border-purple-400/40 hover:bg-purple-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
            >
              <span
                className={cn(
                  "shrink-0 font-semibold text-purple-700 dark:text-purple-200",
                  numbered && "num"
                )}
              >
                {label}
              </span>
              <span className="min-w-0 flex-1 truncate">{episode.name}</span>
              <span className="shrink-0 text-muted-foreground">영상 보기</span>
            </a>
          )
        })}
      </div>
    </div>
  )
}
