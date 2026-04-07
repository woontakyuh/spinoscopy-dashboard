"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { FeedCard } from "./FeedCard"
import type { FeedItem, FeedResponse, FeedSource, FeedTier } from "@/lib/types/radar"

const TABS: Array<{ value: FeedTier; label: string }> = [
  { value: "ai-company", label: "News" },
  { value: "thought-leader", label: "AI Leaders" },
  { value: "newsletter", label: "Papers" },
]

type SortMode = "date" | "importance"

export function RadarFeed() {
  const [tab, setTab] = useState<FeedTier>("ai-company")
  const [sortMode, setSortMode] = useState<SortMode>("date")
  const [visibleCount, setVisibleCount] = useState(20)
  const [selectedSources, setSelectedSources] = useState<Set<FeedSource>>(new Set())

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

  // 현재 탭의 아이템에서 소스 목록 + 카운트 추출
  const tabItems = items.filter((item) => item.tier === tab)
  const SOURCE_PRIORITY: FeedSource[] = [
    "anthropic-engineering",
    "anthropic-research",
    "deepmind-blog",
    "google-ai-blog",
    "openai-blog",
    "the-batch",
    "moduletter",
  ]
  const sourceOptions = Array.from(
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

  const filtered = tabItems
    .filter((item) => selectedSources.size === 0 || selectedSources.has(item.source))
    .sort((a, b) => {
      if (sortMode === "date") {
        if (a.date !== b.date) return b.date.localeCompare(a.date)
        return b.importanceScore - a.importanceScore
      }
      if (a.importanceScore !== b.importanceScore) return b.importanceScore - a.importanceScore
      return b.date.localeCompare(a.date)
    })

  // 탭 변경 시 visibleCount + 소스 선택 리셋
  function handleTabChange(value: FeedTier) {
    setTab(value)
    setVisibleCount(20)
    setSelectedSources(new Set())
  }

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
    <div className="space-y-3">
      {/* 탭 */}
      <div className="flex items-center gap-1 border-b border-zinc-800">
        {TABS.map((t) => {
          const active = tab === t.value
          const count = items.filter((i) => i.tier === t.value).length
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => handleTabChange(t.value)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                active
                  ? "border-cyan-500 text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-xs text-zinc-500">{count}</span>
            </button>
          )
        })}
      </div>

      {/* 정렬 + 시간 */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-zinc-500 mr-1">정렬</span>
        <Button
          variant={sortMode === "date" ? "default" : "outline"}
          size="sm"
          className={`text-xs h-7 ${
            sortMode === "date"
              ? "bg-cyan-600 hover:bg-cyan-500 text-white"
              : "border-zinc-700 text-zinc-400 hover:text-white"
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
              : "border-zinc-700 text-zinc-400 hover:text-white"
          }`}
          onClick={() => setSortMode("importance")}
        >
          중요도순
        </Button>
        <span className="text-xs text-zinc-500 ml-1">{filtered.length}개</span>
        <div className="flex-1" />
        {feedQuery.data?.fetchedAt && (
          <span className="text-zinc-500 text-xs">
            {new Date(feedQuery.data.fetchedAt).toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
            })} 기준
          </span>
        )}
      </div>

      {/* 소스 필터 칩 (탭 내) — 한 줄, 가로 스크롤 폴백 */}
      {sourceOptions.length > 1 && (
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide whitespace-nowrap">
          <button
            type="button"
            onClick={() => { setSelectedSources(new Set()); setVisibleCount(20) }}
            className={`shrink-0 px-1.5 py-0.5 text-[10px] rounded-full border transition-colors ${
              selectedSources.size === 0
                ? "border-cyan-500/60 text-cyan-300 bg-cyan-500/10"
                : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
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
                    : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      )}

      {feedQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={`skeleton-${String(i)}`} className="border border-zinc-700 rounded-lg p-3 bg-zinc-800/50 space-y-2">
              <Skeleton className="h-4 w-3/4 bg-zinc-700" />
              <Skeleton className="h-3 w-1/3 bg-zinc-700" />
              <Skeleton className="h-3 w-1/2 bg-zinc-700" />
            </div>
          ))}
        </div>
      ) : feedQuery.isError ? (
        <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900">
          <p className="text-red-400 text-sm">오류: {(feedQuery.error as Error).message}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 text-xs border-zinc-700 text-zinc-300"
            onClick={() => feedQuery.refetch()}
          >
            재시도
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900">
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
                className="text-xs border-zinc-700 text-zinc-400 hover:text-white"
                onClick={() => setVisibleCount(prev => prev + 20)}
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
