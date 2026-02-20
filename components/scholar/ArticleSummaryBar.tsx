"use client"

import type { JournalArticle, JournalStats } from "@/lib/types/journal"

interface ArticleSummaryBarProps {
  stats: JournalStats | undefined
  articles?: JournalArticle[]
}

export function ArticleSummaryBar({ stats, articles }: ArticleSummaryBarProps) {
  if (!stats) return null

  const journals = Object.entries(stats.by_journal).sort(([, a], [, b]) => b - a)
  const categories = Object.entries(stats.by_category).sort(([, a], [, b]) => b - a).slice(0, 8)
  const mustReads = (articles ?? []).filter((a) => a.interest === "🔴 필독").slice(0, 5)

  const mustReadCount = stats.by_interest["🔴 필독"] ?? 0
  const interestCount = stats.by_interest["🟡 관심"] ?? 0
  const refCount = stats.by_interest["⚪ 참고"] ?? 0

  return (
    <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-zinc-300 text-sm font-semibold">이번 주 업데이트</h3>
        <span className="text-cyan-400 text-xs font-semibold bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full">
          +{stats.recent_week}편
        </span>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 bg-red-500/5 border border-red-500/20 rounded-lg p-3 text-center">
          <div className="text-red-400 text-lg font-bold">{mustReadCount}</div>
          <div className="text-red-400/70 text-[10px]">🔴 필독</div>
        </div>
        <div className="flex-1 bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3 text-center">
          <div className="text-yellow-400 text-lg font-bold">{interestCount}</div>
          <div className="text-yellow-400/70 text-[10px]">🟡 관심</div>
        </div>
        <div className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-center">
          <div className="text-zinc-300 text-lg font-bold">{refCount}</div>
          <div className="text-zinc-500 text-[10px]">⚪ 참고</div>
        </div>
        <div className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-center">
          <div className="text-white text-lg font-bold">{stats.total}</div>
          <div className="text-zinc-500 text-[10px]">전체</div>
        </div>
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

      {mustReads.length > 0 && (
        <div className="border-t border-zinc-800 pt-3">
          <h4 className="text-red-400 text-xs font-semibold mb-2">🔴 필독 논문</h4>
          <div className="space-y-2">
            {mustReads.map((a) => (
              <div key={a.page_id} className="bg-red-500/5 border border-red-500/10 rounded-lg px-3 py-2">
                <p className="text-zinc-200 text-xs leading-relaxed">
                  {a.title.length > 100 ? a.title.slice(0, 100) + "..." : a.title}
                </p>
                {a.summary && (
                  <p className="text-blue-400 text-[11px] italic mt-1 leading-relaxed">
                    {a.summary.length > 100 ? a.summary.slice(0, 100) + "..." : a.summary}
                  </p>
                )}
                <p className="text-zinc-600 text-[10px] mt-1">{a.journal_name}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
