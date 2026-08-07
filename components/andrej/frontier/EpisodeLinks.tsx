import type { AiFrontierEpisode } from "@/lib/types/ai-frontier"
import { cn } from "@/lib/utils"

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
          ? "border-purple-400/50 bg-purple-500/15 text-purple-800 hover:bg-purple-500/25 dark:bg-purple-500/20 dark:text-purple-100 dark:hover:bg-purple-500/30"
          : "border-border bg-card text-foreground hover:border-muted-foreground/50 hover:bg-muted"
      )}
    >
      {label}
    </a>
  )
}

export function EpisodeLinks({ episode }: { readonly episode: AiFrontierEpisode }) {
  const youtube = safeHttpUrl(episode.youtube)
  const transcript = (episode.transcriptSource ?? "").trim()
  const transcriptHref = safeHttpUrl(episode.transcriptSource)

  return (
    <div
      data-testid={`frontier-episode-source-links-${episode.id}`}
      className="flex flex-wrap items-center gap-2"
    >
      <ExternalLink href={notionUrl(episode.id)} label="Notion에서 본문 읽기" primary />
      {youtube !== null && <ExternalLink href={youtube} label="YouTube 보기" />}
      {transcriptHref !== null && <ExternalLink href={transcriptHref} label="전사 원문 보기" />}
      {transcriptHref === null && transcript !== "" && (
        <span
          data-testid={`frontier-episode-transcript-${episode.id}`}
          className="text-xs text-muted-foreground"
        >
          전사 출처: {transcript}
        </span>
      )}
    </div>
  )
}
