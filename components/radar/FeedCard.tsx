"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { FeedItem, SummarizeResponse } from "@/lib/types/radar"
import { buildObsidianUri } from "@/lib/radar/obsidian"

interface FeedCardProps {
  item: FeedItem
}

const SOURCE_STYLES: Record<string, { border: string; text: string }> = {
  hn: { border: "border-orange-500/40", text: "text-orange-300" },
  "the-batch": { border: "border-blue-500/40", text: "text-blue-300" },
}

export function FeedCard({ item }: FeedCardProps) {
  const [summary, setSummary] = useState<string | null>(item.summary)
  const [loading, setLoading] = useState(false)

  const style = SOURCE_STYLES[item.source] ?? SOURCE_STYLES.hn

  async function handleSummarize() {
    setLoading(true)
    try {
      const res = await fetch("/api/ai-feed/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: item.title, url: item.url }),
      })
      if (!res.ok) throw new Error("요약 실패")
      const data = (await res.json()) as SummarizeResponse
      setSummary(data.summary)
    } catch {
      setSummary("요약에 실패했습니다.")
    } finally {
      setLoading(false)
    }
  }

  function handleSaveObsidian() {
    const uri = buildObsidianUri({ ...item, summary })
    window.open(uri, "_blank")
  }

  return (
    <div className="border border-zinc-700 rounded-lg p-3 bg-zinc-800/50 space-y-2">
      <div className="flex flex-wrap items-start gap-2">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="text-white text-sm font-medium hover:text-blue-300 transition-colors flex-1 min-w-0"
        >
          {item.title}
        </a>
        <Badge variant="outline" className={`text-[10px] shrink-0 ${style.border} ${style.text}`}>
          {item.sourceLabel}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        {item.date && <span>{item.date}</span>}
        {item.author && <span>· {item.author}</span>}
        {item.points != null && <span>· {item.points}pts</span>}
        {item.commentUrl && (
          <a href={item.commentUrl} target="_blank" rel="noreferrer" className="hover:text-zinc-200">
            · 댓글
          </a>
        )}
      </div>

      {summary && (
        <p className="text-zinc-300 text-xs bg-zinc-900/60 rounded-md px-2.5 py-1.5">
          {summary}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 border-zinc-700 text-zinc-300 hover:text-white"
          disabled={loading || !!summary}
          onClick={handleSummarize}
        >
          {loading ? "요약 중..." : summary ? "요약 완료" : "한줄 요약"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 border-zinc-700 text-zinc-300 hover:text-white"
          onClick={handleSaveObsidian}
        >
          Obsidian 저장
        </Button>
      </div>
    </div>
  )
}
