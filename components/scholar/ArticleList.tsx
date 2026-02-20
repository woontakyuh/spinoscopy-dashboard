"use client"

import { Badge } from "@/components/ui/badge"
import type { JournalArticle } from "@/lib/types/journal"

interface ArticleListProps {
  articles: JournalArticle[]
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
  onSelect: (article: JournalArticle) => void
  selectedId?: string
}

function interestColor(interest: string) {
  if (interest.includes("필독")) return "bg-red-500/20 text-red-400 border-red-500/30"
  if (interest.includes("관심")) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
  return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
}

function formatDateHeader(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00")
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"]
    return `${dateStr} (${weekdays[d.getDay()]})`
  } catch {
    return dateStr
  }
}

function groupByDate(articles: JournalArticle[]): [string, JournalArticle[]][] {
  const map = new Map<string, JournalArticle[]>()
  for (const article of articles) {
    const key = article.pub_date ?? "날짜 없음"
    const arr = map.get(key)
    if (arr) arr.push(article)
    else map.set(key, [article])
  }
  return Array.from(map.entries())
}

export function ArticleList({
  articles,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onSelect,
  selectedId,
}: ArticleListProps) {
  if (articles.length === 0) {
    return <p className="text-zinc-500 text-sm text-center py-8">논문이 없습니다.</p>
  }

  const dateGroups = groupByDate(articles)

  return (
    <div className="space-y-4">
      {dateGroups.map(([date, group]) => (
        <div key={date}>
          <div className="flex items-center gap-2 mb-2 sticky top-0 bg-zinc-950/90 backdrop-blur-sm py-1 z-10">
            <span className="text-zinc-400 text-xs font-medium">
              {date === "날짜 없음" ? date : formatDateHeader(date)}
            </span>
            <span className="text-zinc-600 text-[10px]">{group.length}편</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          <div className="border border-zinc-700 rounded-lg overflow-hidden">
            {group.map((article) => (
              <button
                type="button"
                key={article.page_id}
                onClick={() => onSelect(article)}
                className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors border-b border-zinc-700/50 last:border-0 ${
                  selectedId === article.page_id
                    ? "bg-blue-600/15 border-l-2 border-l-blue-500"
                    : "bg-zinc-800/40 hover:bg-zinc-700/60"
                }`}
              >
                <div className="shrink-0 mt-1">
                  <span
                    className={`inline-block w-2.5 h-2.5 rounded-full ${
                      !article.read
                        ? "bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.5)] animate-pulse"
                        : "bg-zinc-700"
                    }`}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 h-5 font-medium ${interestColor(article.interest)}`}
                    >
                      {article.interest.slice(2)}
                    </Badge>
                    {article.journal_name && (
                      <span className="text-zinc-500 text-[10px] font-medium">{article.journal_name}</span>
                    )}
                  </div>
                  <p className="text-zinc-200 text-sm leading-snug line-clamp-2">
                    {article.title}
                  </p>
                  {article.interest.includes("필독") && article.summary && (
                    <p className="text-zinc-400 text-xs mt-1 italic line-clamp-1">
                      {article.summary}
                    </p>
                  )}
                  {article.authors && (
                    <p className="text-zinc-600 text-xs mt-1 truncate">{article.authors}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}

      {hasMore && (
        <div className="text-center pt-2 pb-4">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="px-6 py-2 rounded-lg text-sm font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50"
          >
            {isLoadingMore ? "로딩 중..." : "더 보기"}
          </button>
        </div>
      )}

      <p className="text-zinc-600 text-xs text-right">
        {articles.length}편 표시{hasMore ? " · 더 있음" : " · 전체"}
      </p>
    </div>
  )
}
