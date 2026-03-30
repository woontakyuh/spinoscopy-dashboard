"use client"

import { useCallback, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { FeedCard } from "./FeedCard"
import type { FeedCategory, FeedItem, FeedResponse, FeedSource, FeedTier } from "@/lib/types/radar"

const TIER_OPTIONS: Array<{ value: FeedTier; label: string }> = [
  { value: "tier1-daily", label: "Daily" },
  { value: "tier2-weekly", label: "Weekly" },
  { value: "tier3-research", label: "Research" },
  { value: "medical-ai", label: "Medical AI" },
  { value: "thought-leader", label: "Thought Leader" },
]

const CATEGORY_FILTERS: Array<{ value: FeedCategory | "all"; label: string }> = [
  { value: "all", label: "전체" },
  { value: "model-release", label: "Model" },
  { value: "tool", label: "Tool" },
  { value: "research", label: "Research" },
  { value: "policy", label: "Policy" },
  { value: "medical-ai", label: "Medical" },
  { value: "opinion", label: "Opinion" },
]

function useMultiSelect<T extends string>() {
  const [selected, setSelected] = useState<Set<T>>(new Set())

  const toggle = useCallback((value: T) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(value)) {
        next.delete(value)
      } else {
        next.add(value)
      }
      return next
    })
  }, [])

  const clear = useCallback(() => setSelected(new Set()), [])

  return { selected, toggle, clear, hasAny: selected.size > 0 }
}

export function RadarFeed() {
  const tiers = useMultiSelect<FeedTier>()
  const sources = useMultiSelect<FeedSource>()
  const [categoryFilter, setCategoryFilter] = useState<FeedCategory | "all">("all")
  const [highOnly, setHighOnly] = useState(false)
  const [visibleCount, setVisibleCount] = useState(20)

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

  // 실제 존재하는 소스만 동적으로 필터 생성
  const sourceOptions = useMemo(() => {
    const seen = new Map<FeedSource, string>()
    for (const item of items) {
      if (!seen.has(item.source)) {
        seen.set(item.source, item.sourceLabel)
      }
    }
    return Array.from(seen.entries()).map(([value, label]) => ({ value, label }))
  }, [items])

  const filtered = items.filter((item) => {
    if (tiers.hasAny && !tiers.selected.has(item.tier)) return false
    if (sources.hasAny && !sources.selected.has(item.source)) return false
    if (categoryFilter !== "all" && !item.categories.includes(categoryFilter)) return false
    if (highOnly && item.importanceScore < 4) return false
    return true
  })

  return (
    <div className="space-y-3">
      {/* Row 1: 티어 필터 (복수선택) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-zinc-500 mr-1">티어</span>
        <Button
          variant={!tiers.hasAny ? "default" : "outline"}
          size="sm"
          className={`text-xs h-7 ${
            !tiers.hasAny
              ? "bg-cyan-600 hover:bg-cyan-500 text-white"
              : "border-zinc-700 text-zinc-400 hover:text-white"
          }`}
          onClick={tiers.clear}
        >
          전체
        </Button>
        {TIER_OPTIONS.map((f) => {
          const active = tiers.selected.has(f.value)
          return (
            <Button
              key={f.value}
              variant={active ? "default" : "outline"}
              size="sm"
              className={`text-xs h-7 ${
                active
                  ? "bg-cyan-600 hover:bg-cyan-500 text-white"
                  : "border-zinc-700 text-zinc-400 hover:text-white"
              }`}
              onClick={() => tiers.toggle(f.value)}
            >
              {f.label}
            </Button>
          )
        })}
        {tiers.hasAny && (
          <span className="text-[10px] text-zinc-500">({tiers.selected.size}개 선택)</span>
        )}
      </div>

      {/* Row 2: 소스별 필터 (복수선택, 동적) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-zinc-500 mr-1">소스</span>
        <Button
          variant={!sources.hasAny ? "default" : "outline"}
          size="sm"
          className={`text-xs h-7 ${
            !sources.hasAny
              ? "bg-zinc-600 hover:bg-zinc-500 text-white"
              : "border-zinc-700 text-zinc-400 hover:text-white"
          }`}
          onClick={sources.clear}
        >
          전체
        </Button>
        {sourceOptions.map((s) => {
          const active = sources.selected.has(s.value)
          return (
            <Button
              key={s.value}
              variant={active ? "default" : "outline"}
              size="sm"
              className={`text-xs h-7 ${
                active
                  ? "bg-zinc-600 hover:bg-zinc-500 text-white"
                  : "border-zinc-700 text-zinc-400 hover:text-white"
              }`}
              onClick={() => sources.toggle(s.value)}
            >
              {s.label}
            </Button>
          )
        })}
        {sources.hasAny && (
          <span className="text-[10px] text-zinc-500">({sources.selected.size}개 선택)</span>
        )}
      </div>

      {/* Row 3: 카테고리 + 중요도 필터 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-zinc-500 mr-1">분류</span>
        {CATEGORY_FILTERS.map((f) => (
          <Button
            key={f.value}
            variant={categoryFilter === f.value ? "default" : "outline"}
            size="sm"
            className={`text-xs h-7 ${
              categoryFilter === f.value
                ? "bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                : "border-zinc-700 text-zinc-400 hover:text-white"
            }`}
            onClick={() => setCategoryFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
        <Button
          variant={highOnly ? "default" : "outline"}
          size="sm"
          className={`text-xs h-7 ${
            highOnly ? "bg-amber-600 hover:bg-amber-500 text-white" : "border-zinc-700 text-zinc-400 hover:text-white"
          }`}
          onClick={() => setHighOnly((prev) => !prev)}
        >
          ★4+
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
