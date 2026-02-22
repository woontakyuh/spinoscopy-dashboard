"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { FeedCard } from "./FeedCard"
import type { FeedItem, FeedResponse, FeedSource } from "@/lib/types/radar"

const SOURCE_FILTERS: Array<{ value: FeedSource | "all"; label: string }> = [
  { value: "all", label: "전체" },
  { value: "hn", label: "Hacker News" },
  { value: "the-batch", label: "The Batch" },
]

export function RadarFeed() {
  const [sourceFilter, setSourceFilter] = useState<FeedSource | "all">("all")

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
  const filtered = sourceFilter === "all"
    ? items
    : items.filter((item) => item.source === sourceFilter)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {SOURCE_FILTERS.map((f) => (
          <Button
            key={f.value}
            variant={sourceFilter === f.value ? "default" : "outline"}
            size="sm"
            className={`text-xs h-7 ${
              sourceFilter === f.value
                ? "bg-cyan-600 hover:bg-cyan-500 text-white"
                : "border-zinc-700 text-zinc-400 hover:text-white"
            }`}
            onClick={() => setSourceFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
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
          <p className="text-zinc-500 text-sm">피드가 비어있습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <FeedCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
