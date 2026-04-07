"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { FeedItem, SummarizeResponse } from "@/lib/types/radar"
import { buildObsidianUri } from "@/lib/radar/obsidian"

interface FeedCardProps {
  item: FeedItem
}

const TIER_STYLES: Record<string, { border: string; text: string }> = {
  "ai-company": { border: "border-cyan-500/40", text: "text-cyan-300" },
  "thought-leader": { border: "border-violet-500/40", text: "text-violet-300" },
  "newsletter": { border: "border-zinc-500/40", text: "text-foreground/90" },
}

const STAR_COLORS: Record<number, string> = {
  1: "text-muted-foreground",
  2: "text-sky-400",
  3: "text-blue-400",
  4: "text-amber-400",
  5: "text-red-400",
}

function ImportanceStars({ score }: { score: number }) {
  const color = STAR_COLORS[score] ?? STAR_COLORS[3]
  return (
    <span className={`text-[11px] shrink-0 ${color}`} title={`중요도 ${score}/5`}>
      {"★".repeat(score)}{"☆".repeat(5 - score)}
    </span>
  )
}

export function FeedCard({ item }: FeedCardProps) {
  const [summary, setSummary] = useState<string | null>(item.summary)
  const [categories, setCategories] = useState(item.categories)
  const [importanceScore, setImportanceScore] = useState(item.importanceScore)
  const [notes, setNotes] = useState<string | null>(item.notes)
  const [loading, setLoading] = useState(false)

  const style = TIER_STYLES[item.tier] ?? TIER_STYLES["newsletter"]

  async function handleSummarize() {
    setLoading(true)
    try {
      const res = await fetch("/api/ai-feed/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: item.title, url: item.url, source: item.source, description: item.summary }),
      })
      if (!res.ok) throw new Error("요약 실패")
      const data = (await res.json()) as SummarizeResponse
      setSummary(data.summary)
      setCategories(data.categories)
      setImportanceScore(data.importanceScore)
      setNotes(data.notes)
    } catch {
      setSummary("요약에 실패했습니다.")
    } finally {
      setLoading(false)
    }
  }

  function handleSaveObsidian() {
    const uri = buildObsidianUri({ ...item, summary, categories, importanceScore, notes })
    window.open(uri, "_blank")
  }

  return (
    <div className="border border-border rounded-lg p-3 bg-muted/50 space-y-2 card-hover">
      <div className="flex flex-wrap items-start gap-2">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="text-foreground text-sm font-medium hover:text-blue-300 transition-colors flex-1 min-w-0"
        >
          {item.title}
        </a>
        <Badge variant="outline" className={`text-[10px] shrink-0 ${style.border} ${style.text}`}>
          {item.sourceLabel}
        </Badge>
        <ImportanceStars score={importanceScore} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {item.date && <span>{item.date}</span>}
        {item.author && <span>· {item.author}</span>}
        {item.points != null && <span>· {item.points}pts</span>}
        {item.commentUrl && (
          <a href={item.commentUrl} target="_blank" rel="noreferrer" className="hover:text-foreground">
            · 댓글
          </a>
        )}
      </div>

      {summary && (
        <p className="text-foreground/90 text-xs bg-card/60 rounded-md px-2.5 py-1.5">
          {summary}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {categories.map((category) => (
          <Badge key={`${item.id}-${category}`} variant="outline" className="text-[10px] border-border text-foreground/90">
            {category}
          </Badge>
        ))}
        <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
          {item.tier}
        </Badge>
        <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
          {item.cadence}
        </Badge>
      </div>

      {notes && <p className="text-[11px] text-muted-foreground">{notes}</p>}

      <div className="flex gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 border-border text-foreground/90 hover:text-foreground"
          disabled={loading || !!summary}
          onClick={handleSummarize}
        >
          {loading ? "요약 중..." : summary ? "요약 완료" : "AI 요약"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 border-border text-foreground/90 hover:text-foreground"
          onClick={handleSaveObsidian}
        >
          Obsidian 저장
        </Button>
      </div>
    </div>
  )
}
