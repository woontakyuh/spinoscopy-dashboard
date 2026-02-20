"use client"

import { useQuery } from "@tanstack/react-query"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import type { JournalArticle, JournalFilter, JournalQueryResult } from "@/lib/types/journal"

interface ArticleListProps {
  filter: JournalFilter
  onSelect: (article: JournalArticle) => void
  selectedId?: string
}

function interestColor(interest: string) {
  if (interest.includes("필독")) return "bg-red-500/20 text-red-400 border-red-500/30"
  if (interest.includes("관심")) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
  return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
}

function buildQueryString(filter: JournalFilter): string {
  const params = new URLSearchParams()
  if (filter.interest && filter.interest !== "all") params.set("interest", filter.interest)
  if (filter.journal && filter.journal !== "all") params.set("journal", filter.journal)
  if (filter.category && filter.category !== "all") params.set("category", filter.category)
  if (filter.read !== undefined && filter.read !== "all") params.set("read", String(filter.read))
  if (filter.search) params.set("search", filter.search)
  if (filter.sort) params.set("sort", filter.sort)
  if (filter.cursor) params.set("cursor", filter.cursor)
  return params.toString()
}

export function ArticleList({ filter, onSelect, selectedId }: ArticleListProps) {
  const qs = buildQueryString(filter)

  const { data, isLoading, error } = useQuery<JournalQueryResult>({
    queryKey: ["journal", qs],
    queryFn: async () => {
      const res = await fetch(`/api/notion/journal?${qs}`)
      if (!res.ok) throw new Error("논문 조회 실패")
      return res.json()
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full bg-zinc-800" />
        ))}
      </div>
    )
  }

  if (error) {
    return <p className="text-red-400 text-sm text-center py-8">로딩 실패: {(error as Error).message}</p>
  }

  const articles = data?.articles ?? []

  if (articles.length === 0) {
    return <p className="text-zinc-500 text-sm text-center py-8">논문이 없습니다.</p>
  }

  return (
    <div className="space-y-1">
      <div className="border border-zinc-700 rounded-lg overflow-hidden">
        {articles.map((article) => (
          <button
            type="button"
            key={article.page_id}
            onClick={() => onSelect(article)}
            className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-zinc-700/50 transition-colors border-b border-zinc-700 last:border-0 ${
              selectedId === article.page_id
                ? "bg-blue-600/10 border-l-2 border-l-blue-500"
                : "bg-zinc-800/50"
            }`}
          >
            <div className="shrink-0 mt-0.5">
              <span className={`inline-block w-2 h-2 rounded-full ${
                !article.read ? "bg-blue-400" : "bg-zinc-600"
              }`} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 h-4 ${interestColor(article.interest)}`}
                >
                  {article.interest.slice(2)}
                </Badge>
                {article.journal_name && (
                  <span className="text-zinc-600 text-[10px]">{article.journal_name}</span>
                )}
                {article.pub_date && (
                  <span className="text-zinc-600 text-[10px]">{article.pub_date}</span>
                )}
              </div>
              <p className="text-zinc-200 text-sm leading-snug line-clamp-2">
                {article.title}
              </p>
              {article.authors && (
                <p className="text-zinc-500 text-xs mt-0.5 truncate">{article.authors}</p>
              )}
            </div>
          </button>
        ))}
      </div>

      {data?.has_more && (
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => onSelect({ ...articles[0], page_id: "__load_more__" } as JournalArticle)}
            className="text-blue-400 text-xs hover:text-blue-300 transition-colors"
          >
            — 목록이 {articles.length}편까지 표시됩니다 —
          </button>
        </div>
      )}

      <p className="text-zinc-600 text-xs text-right pt-1">
        {articles.length}편 표시{data?.has_more ? " · 더 있음" : ""}
      </p>
    </div>
  )
}
