import { BookOpenText, FileText, Youtube } from "lucide-react"
import type { ReactNode } from "react"

import type { AiFrontierEpisode } from "@/lib/types/ai-frontier"

import { frontierTranscriptLinkLabel } from "./frontier-source"

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
  "inline-flex size-9 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:border-purple-400/50 hover:bg-purple-500/10 hover:text-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 dark:hover:text-purple-200"

function ExternalLink({
  href,
  label,
  children,
}: {
  readonly href: string
  readonly label: string
  readonly children: ReactNode
}) {
  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      target="_blank"
      rel="noreferrer noopener"
      className={linkClass}
    >
      {children}
    </a>
  )
}

export function EpisodeLinks({ episode }: { readonly episode: AiFrontierEpisode }) {
  const youtube = safeHttpUrl(episode.youtube)
  const frontier = safeHttpUrl(episode.transcriptSource)

  return (
    <div
      data-testid={`frontier-episode-source-links-${episode.id}`}
      className="flex flex-wrap items-center gap-2"
    >
      <ExternalLink href={notionUrl(episode.id)} label="Notion에서 본문 읽기">
        <FileText aria-hidden="true" className="size-4" strokeWidth={1.8} />
      </ExternalLink>
      {youtube !== null && (
        <ExternalLink href={youtube} label="YouTube에서 영상 보기">
          <Youtube aria-hidden="true" className="size-4" strokeWidth={1.8} />
        </ExternalLink>
      )}
      {/* 링크 문구는 URL 호스트가 아니라 저장된 출처를 따른다. */}
      {frontier !== null && (
        <ExternalLink href={frontier} label={frontierTranscriptLinkLabel(episode.source)}>
          <BookOpenText aria-hidden="true" className="size-4" strokeWidth={1.8} />
        </ExternalLink>
      )}
    </div>
  )
}
