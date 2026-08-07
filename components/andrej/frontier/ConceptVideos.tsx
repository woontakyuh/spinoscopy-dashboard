import type { AiFrontierConcept, AiFrontierEpisode } from "@/lib/types/ai-frontier"

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

function episodeNumber(ref: string): number | null {
  const match = /(\d+)/.exec(ref)
  return match === null ? null : Number.parseInt(match[1], 10)
}

function relatedVideos(concept: AiFrontierConcept, episodes: AiFrontierEpisode[]) {
  const byId = new Map(episodes.map((episode) => [episode.id, episode]))
  const byNumber = new Map(
    episodes.flatMap((episode) =>
      episode.episodeNumber === null ? [] : [[episode.episodeNumber, episode] as const]
    )
  )
  const seen = new Set<string>()

  return concept.episodes.flatMap((ref) => {
    const number = episodeNumber(ref.ref)
    const episode =
      (ref.pageId === null ? undefined : byId.get(ref.pageId)) ??
      (number === null ? undefined : byNumber.get(number))
    if (episode === undefined || seen.has(episode.id)) return []
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
          const number = episode.episodeNumber === null ? "EP" : `EP${episode.episodeNumber}`
          return (
            <a
              key={episode.id}
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`${number} ${episode.name} 영상 보기`}
              className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-xs text-foreground transition-colors hover:border-purple-400/40 hover:bg-purple-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
            >
              <span className="num shrink-0 font-semibold text-purple-700 dark:text-purple-200">{number}</span>
              <span className="min-w-0 flex-1 truncate">{episode.name}</span>
              <span className="shrink-0 text-muted-foreground">영상 보기</span>
            </a>
          )
        })}
      </div>
    </div>
  )
}
