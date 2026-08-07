"use client"

import { Download, LoaderCircle, RotateCcw } from "lucide-react"
import { useState } from "react"

import type { AiFrontierEpisode } from "@/lib/types/ai-frontier"

interface EpisodeImportButtonProps {
  readonly episode: AiFrontierEpisode
  readonly onImported: () => Promise<unknown> | unknown
}

type ImportState = "idle" | "loading" | "error"

export function EpisodeImportButton({
  episode,
  onImported,
}: EpisodeImportButtonProps) {
  const [state, setState] = useState<ImportState>("idle")
  const [error, setError] = useState<string | null>(null)

  if (episode.status === "완료") return null

  const collecting = state === "loading" || episode.status === "수집 중"
  const retry = state === "error" || episode.status === "수집 실패"
  const label = collecting
    ? "자료 가져오는 중…"
    : retry
      ? "다시 가져오기"
      : "자료 가져오기"
  const Icon = collecting ? LoaderCircle : retry ? RotateCcw : Download

  const importEpisode = async () => {
    setState("loading")
    setError(null)
    try {
      const response = await fetch(
        `/api/andrej/frontier/episodes/${encodeURIComponent(episode.id)}/import`,
        { method: "POST" }
      )
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(payload?.error ?? "자료를 가져오지 못했습니다.")
      }
      await onImported()
      setState("idle")
    } catch (cause) {
      setState("error")
      setError(cause instanceof Error ? cause.message : "자료를 가져오지 못했습니다.")
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        disabled={collecting}
        onClick={() => void importEpisode()}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-purple-400/50 bg-purple-500/15 px-3 py-2 text-xs font-semibold text-purple-800 transition-colors hover:bg-purple-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 disabled:cursor-wait disabled:opacity-70 dark:text-purple-100"
      >
        <Icon
          aria-hidden="true"
          className={collecting ? "size-3.5 animate-spin" : "size-3.5"}
          strokeWidth={1.8}
        />
        {label}
      </button>
      {error !== null && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  )
}
