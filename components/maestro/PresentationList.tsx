"use client"

import { useQuery } from "@tanstack/react-query"
import { Skeleton } from "@/components/ui/skeleton"
import { PresentationCard } from "./PresentationCard"
import type { PresentationsResponse } from "@/lib/types/maestro"

export function PresentationList() {
  const { data, isLoading, error, refetch } = useQuery<PresentationsResponse>({
    queryKey: ["maestro", "presentations"],
    queryFn: async () => {
      const res = await fetch("/api/maestro/presentations")
      if (!res.ok) throw new Error("발표 목록 조회 실패")
      return res.json()
    },
    staleTime: 2 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full bg-zinc-800 rounded-xl" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 text-sm mb-3">
          로딩 실패: {(error as Error).message}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-4 py-2 rounded-lg text-sm bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 transition-colors"
        >
          다시 시도
        </button>
      </div>
    )
  }

  const presentations = data?.presentations ?? []

  if (presentations.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-500 text-sm">예정된 발표가 없습니다</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {presentations.map((p) => (
        <PresentationCard key={p.page_id} presentation={p} />
      ))}
      <p className="text-zinc-600 text-xs text-right">{presentations.length}건</p>
    </div>
  )
}
