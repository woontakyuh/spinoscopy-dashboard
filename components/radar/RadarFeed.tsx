"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { FeedCard } from "./FeedCard"
import type { FeedItem, FeedResponse, FeedSource, FeedTier } from "@/lib/types/radar"

const TIERS: Array<{ value: FeedTier; label: string }> = [
  { value: "ai-company", label: "News" },
  { value: "thought-leader", label: "AI Leaders" },
  { value: "newsletter", label: "Papers" },
]

type SortMode = "date" | "importance"

const SOURCE_PRIORITY: FeedSource[] = [
  "anthropic-engineering",
  "anthropic-research",
  "deepmind-blog",
  "google-ai-blog",
  "openai-blog",
  "the-batch",
  "moduletter",
]

function getSourceOptions(tabItems: FeedItem[]) {
  return Array.from(
    tabItems.reduce((map, item) => {
      const entry = map.get(item.source)
      if (entry) entry.count += 1
      else map.set(item.source, { id: item.source, label: item.sourceLabel, count: 1 })
      return map
    }, new Map<FeedSource, { id: FeedSource; label: string; count: number }>()).values()
  ).sort((a, b) => {
    const ai = SOURCE_PRIORITY.indexOf(a.id)
    const bi = SOURCE_PRIORITY.indexOf(b.id)
    if (ai !== -1 || bi !== -1) {
      return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi)
    }
    return b.count - a.count
  })
}

function sortItems(items: FeedItem[], sortMode: SortMode) {
  return items.slice().sort((a, b) => {
    if (sortMode === "date") {
      if (a.date !== b.date) return b.date.localeCompare(a.date)
      return b.importanceScore - a.importanceScore
    }
    if (a.importanceScore !== b.importanceScore) return b.importanceScore - a.importanceScore
    return b.date.localeCompare(a.date)
  })
}

// ─── Single-column feed for one tier ───
function FeedColumn({ tier, items, fetchedAt }: { tier: typeof TIERS[number]; items: FeedItem[]; fetchedAt?: string }) {
  const [sortMode, setSortMode] = useState<SortMode>("date")
  const [visibleCount, setVisibleCount] = useState(20)
  const [selectedSources, setSelectedSources] = useState<Set<FeedSource>>(new Set())

  const tabItems = items.filter((i) => i.tier === tier.value)
  const sourceOptions = getSourceOptions(tabItems)

  const filtered = sortItems(
    tabItems.filter((item) => selectedSources.size === 0 || selectedSources.has(item.source)),
    sortMode
  )

  function toggleSource(source: FeedSource) {
    setSelectedSources((prev) => {
      const next = new Set(prev)
      if (next.has(source)) next.delete(source)
      else next.add(source)
      return next
    })
    setVisibleCount(20)
  }

  return (
    <div className="space-y-2">
      {/* Column header (desktop only — mobile uses tabs) */}
      <div className="hidden md:flex items-center gap-2 pb-1 border-b border-border">
        <h3 className="text-sm font-medium text-foreground">{tier.label}</h3>
        <span className="text-xs text-muted-foreground">{tabItems.length}</span>
      </div>

      {/* Sort + count */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground mr-1">정렬</span>
        <Button
          variant={sortMode === "date" ? "default" : "outline"}
          size="sm"
          className={`text-xs h-7 ${
            sortMode === "date"
              ? "bg-cyan-600 hover:bg-cyan-500 text-white"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setSortMode("date")}
        >
          최신순
        </Button>
        <Button
          variant={sortMode === "importance" ? "default" : "outline"}
          size="sm"
          className={`text-xs h-7 ${
            sortMode === "importance"
              ? "bg-amber-600 hover:bg-amber-500 text-white"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setSortMode("importance")}
        >
          중요도순
        </Button>
        <span className="text-xs text-muted-foreground ml-1">{filtered.length}개</span>
        {/* fetchedAt: only show on mobile (desktop shows once at top) */}
        {fetchedAt && (
          <span className="md:hidden text-muted-foreground text-xs ml-auto">
            {new Date(fetchedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 기준
          </span>
        )}
      </div>

      {/* Source filter chips */}
      {sourceOptions.length > 1 && (
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide whitespace-nowrap">
          <button
            type="button"
            onClick={() => { setSelectedSources(new Set()); setVisibleCount(20) }}
            className={`shrink-0 px-1.5 py-0.5 text-[10px] rounded-full border transition-colors ${
              selectedSources.size === 0
                ? "border-cyan-500/60 text-cyan-300 bg-cyan-500/10"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            전체
          </button>
          {sourceOptions.map((s) => {
            const active = selectedSources.has(s.id)
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleSource(s.id)}
                className={`shrink-0 px-1.5 py-0.5 text-[10px] rounded-full border transition-colors ${
                  active
                    ? "border-cyan-500/60 text-cyan-300 bg-cyan-500/10"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Feed list */}
      {filtered.length === 0 ? (
        <div className="border border-border rounded-xl p-4 bg-card">
          <EmptyState icon="🛰️" message="피드가 비어있습니다." />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.slice(0, visibleCount).map((item) => (
            <FeedCard key={item.id} item={item} />
          ))}
          {filtered.length > visibleCount && (
            <div className="flex justify-center pt-2 pb-4">
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-border text-muted-foreground hover:text-foreground"
                onClick={() => setVisibleCount((prev) => prev + 20)}
              >
                더보기 ({filtered.length - visibleCount}개 남음)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main RadarFeed ───
export function RadarFeed() {
  const [mobileTab, setMobileTab] = useState<FeedTier>("ai-company")

  const feedQuery = useQuery({
    queryKey: ["radar-feed"],
    queryFn: async () => {
      const res = await fetch("/api/ai-feed")
      if (!res.ok) throw new Error("피드 조회 실패")
      return res.json() as Promise<FeedResponse>
    },
    staleTime: 5 * 60 * 1000,
  })

  const items: FeedItem[] = feedQuery.data?.items ?? []

  if (feedQuery.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={`skeleton-${String(i)}`} className="border border-border rounded-lg p-3 bg-muted/50 space-y-2">
            <Skeleton className="h-4 w-3/4 bg-muted" />
            <Skeleton className="h-3 w-1/3 bg-muted" />
            <Skeleton className="h-3 w-1/2 bg-muted" />
          </div>
        ))}
      </div>
    )
  }

  if (feedQuery.isError) {
    return (
      <div className="border border-border rounded-xl p-4 bg-card">
        <p className="text-red-400 text-sm">오류: {(feedQuery.error as Error).message}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2 text-xs border-border text-foreground/90"
          onClick={() => feedQuery.refetch()}
        >
          재시도
        </Button>
      </div>
    )
  }

  const activeTier = TIERS.find((t) => t.value === mobileTab)!

  return (
    <div className="space-y-3">
      {/* ─── Mobile: tab navigation ─── */}
      <div className="md:hidden flex items-center gap-1 border-b border-border">
        {TIERS.map((t) => {
          const active = mobileTab === t.value
          const count = items.filter((i) => i.tier === t.value).length
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setMobileTab(t.value)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                active
                  ? "border-cyan-500 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground/90"
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-xs text-muted-foreground">{count}</span>
            </button>
          )
        })}
      </div>

      {/* ─── Mobile: single column ─── */}
      <div className="md:hidden">
        <FeedColumn tier={activeTier} items={items} fetchedAt={feedQuery.data?.fetchedAt} />
      </div>

      {/* ─── Desktop: 3-column grid ─── */}
      <div className="hidden md:block">
        {feedQuery.data?.fetchedAt && (
          <div className="flex justify-end mb-2">
            <span className="text-muted-foreground text-xs">
              {new Date(feedQuery.data.fetchedAt).toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit",
              })} 기준
            </span>
          </div>
        )}
        <div className="grid grid-cols-3 gap-4">
          {TIERS.map((tier) => (
            <FeedColumn key={tier.value} tier={tier} items={items} />
          ))}
        </div>
      </div>
    </div>
  )
}
