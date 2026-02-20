"use client"

import { useQuery } from "@tanstack/react-query"
import { Skeleton } from "@/components/ui/skeleton"
import type { JournalStats } from "@/lib/types/journal"

function StatCard({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900">
      <p className="text-zinc-500 text-xs mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? "text-white"}`}>{value}</p>
    </div>
  )
}

export function StatsOverview() {
  const { data: stats, isLoading, error } = useQuery<JournalStats>({
    queryKey: ["journal", "stats"],
    queryFn: async () => {
      const res = await fetch("/api/notion/journal?action=stats")
      if (!res.ok) throw new Error("통계 조회 실패")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 bg-zinc-800" />
          ))}
        </div>
        <Skeleton className="h-32 bg-zinc-800" />
      </div>
    )
  }

  if (error || !stats) {
    return <p className="text-red-400 text-sm text-center py-8">통계를 불러오지 못했습니다.</p>
  }

  const maxJournal = Math.max(...Object.values(stats.by_journal), 1)

  const sortedJournals = Object.entries(stats.by_journal)
    .sort(([, a], [, b]) => b - a)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="전체 논문" value={stats.total} />
        <StatCard label="안 읽은 논문" value={stats.unread} accent="text-blue-400" />
        <StatCard label="이번 주 신규" value={stats.recent_week} accent="text-green-400" />
        <StatCard
          label="필독 미읽음"
          value={stats.by_interest["🔴 필독"]}
          accent="text-red-400"
        />
      </div>

      <div className="flex gap-3">
        {(["🔴 필독", "🟡 관심", "⚪ 참고"] as const).map((level) => {
          const count = stats.by_interest[level] ?? 0
          const colorMap = {
            "🔴 필독": "bg-red-500/20 text-red-400",
            "🟡 관심": "bg-yellow-500/20 text-yellow-400",
            "⚪ 참고": "bg-zinc-500/20 text-zinc-400",
          }
          return (
            <div
              key={level}
              className={`flex-1 rounded-lg px-3 py-2 text-center ${colorMap[level]}`}
            >
              <p className="text-lg font-bold">{count}</p>
              <p className="text-xs">{level.slice(2)}</p>
            </div>
          )
        })}
      </div>

      <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900">
        <p className="text-zinc-300 text-sm font-medium mb-3">저널별 분포</p>
        <div className="space-y-2">
          {sortedJournals.map(([name, count]) => (
            <div key={name} className="flex items-center gap-3">
              <span className="text-zinc-400 text-xs w-24 shrink-0 text-right">{name}</span>
              <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded transition-all"
                  style={{ width: `${(count / maxJournal) * 100}%` }}
                />
              </div>
              <span className="text-zinc-500 text-xs w-8">{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
