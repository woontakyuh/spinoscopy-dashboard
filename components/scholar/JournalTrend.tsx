"use client"

import type { JournalStats } from "@/lib/types/journal"

interface JournalTrendProps {
  stats: JournalStats | undefined
}

const BAR_COLORS = ["bg-blue-600", "bg-violet-600"]

export function JournalTrend({ stats }: JournalTrendProps) {
  if (!stats) {
    return <p className="text-zinc-500 text-sm text-center py-4">통계를 불러오는 중...</p>
  }

  const sorted = Object.entries(stats.by_category)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)

  if (sorted.length === 0) {
    return <p className="text-zinc-500 text-sm text-center py-4">카테고리 데이터가 없습니다.</p>
  }

  const maxVal = Math.max(...sorted.map(([, v]) => v), 1)

  return (
    <div className="space-y-2">
      <p className="text-zinc-300 text-sm font-medium mb-2">카테고리 분포 (상위 8개)</p>
      {sorted.map(([name, count], i) => (
        <div key={name} className="flex items-center gap-3">
          <span className="text-zinc-400 text-xs w-24 shrink-0 text-right truncate" title={name}>
            {name}
          </span>
          <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
            <div
              className={`h-full rounded transition-all ${BAR_COLORS[i % BAR_COLORS.length]}`}
              style={{ width: `${(count / maxVal) * 100}%` }}
            />
          </div>
          <span className="text-zinc-500 text-xs w-8">{count}</span>
        </div>
      ))}
    </div>
  )
}
