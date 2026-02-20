"use client"

import type { JournalStats } from "@/lib/types/journal"

interface ArticleSummaryBarProps {
  stats: JournalStats | undefined
}

export function ArticleSummaryBar({ stats }: ArticleSummaryBarProps) {
  if (!stats) return null

  const journals = Object.entries(stats.by_journal).sort(([, a], [, b]) => b - a)
  const categories = Object.entries(stats.by_category).sort(([, a], [, b]) => b - a).slice(0, 6)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-red-400 text-xs font-semibold shrink-0">
          🔴 필독 {stats.by_interest["🔴 필독"]}편
        </span>
        <span className="text-yellow-400 text-xs shrink-0">
          🟡 {stats.by_interest["🟡 관심"]}
        </span>
        <span className="text-zinc-500 text-xs shrink-0">
          ⚪ {stats.by_interest["⚪ 참고"]}
        </span>
        <span className="text-zinc-600 mx-1">·</span>
        <span className="text-zinc-400 text-xs">
          전체 {stats.total} · 안 읽음 {stats.unread}
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {journals.map(([name, count]) => (
          <span
            key={name}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-[11px]"
          >
            <span className="text-zinc-400">{name}</span>
            <span className="text-zinc-200 font-semibold">{count}</span>
          </span>
        ))}
      </div>

      {categories.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {categories.map(([cat, count]) => (
            <span
              key={cat}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[11px]"
            >
              <span className="text-blue-400">{cat}</span>
              <span className="text-blue-300">{count}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
