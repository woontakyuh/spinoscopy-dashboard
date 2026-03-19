"use client"

import { useState, useCallback, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Skeleton } from "@/components/ui/skeleton"
import { TopBar } from "@/components/layout/TopBar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArticleFilter } from "@/components/scholar/ArticleFilter"
import { ArticleList } from "@/components/scholar/ArticleList"
import { ArticleDetail } from "@/components/scholar/ArticleDetail"
import { DashboardCharts } from "@/components/scholar/DashboardCharts"
import type { JournalArticle, JournalFilter, JournalQueryResult, JournalStats } from "@/lib/types/journal"

function buildQueryString(filter: JournalFilter): string {
  const params = new URLSearchParams()
  if (filter.interest && filter.interest !== "all") params.set("interest", filter.interest)
  if (filter.journal && filter.journal !== "all") params.set("journal", filter.journal)
  if (filter.category && filter.category !== "all") params.set("category", filter.category)
  if (filter.read !== undefined && filter.read !== "all") params.set("read", String(filter.read))
  if (filter.search) params.set("search", filter.search)
  if (filter.sort) params.set("sort", filter.sort)
  return params.toString()
}

export default function ScholarPage() {
  const [activeTab, setActiveTab] = useState("dashboard")
  const [selectedArticle, setSelectedArticle] = useState<JournalArticle | null>(null)
  const [filter, setFilter] = useState<JournalFilter>({
    interest: "all",
    journal: "all",
    read: "all",
    sort: "date_desc",
  })
  const [allArticles, setAllArticles] = useState<JournalArticle[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const filterQs = buildQueryString(filter)

  const { isLoading, error } = useQuery<JournalQueryResult>({
    queryKey: ["journal", filterQs],
    queryFn: async () => {
      const res = await fetch(`/api/notion/journal?${filterQs}`)
      if (!res.ok) throw new Error("논문 조회 실패")
      const data: JournalQueryResult = await res.json()
      setAllArticles(data.articles)
      setNextCursor(data.next_cursor)
      setHasMore(data.has_more)
      return data
    },
    enabled: activeTab === "browse",
  })

  const { data: stats } = useQuery<JournalStats>({
    queryKey: ["journal", "stats"],
    queryFn: async () => {
      const res = await fetch("/api/notion/journal?action=stats")
      if (!res.ok) throw new Error("통계 조회 실패")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
    enabled: activeTab === "browse",
  })

  useEffect(() => {
    setAllArticles([])
    setNextCursor(null)
    setHasMore(false)
  }, [filterQs])

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return
    setIsLoadingMore(true)
    try {
      const res = await fetch(`/api/notion/journal?${filterQs}&cursor=${nextCursor}`)
      if (!res.ok) throw new Error("추가 로딩 실패")
      const data: JournalQueryResult = await res.json()
      setAllArticles((prev) => [...prev, ...data.articles])
      setNextCursor(data.next_cursor)
      setHasMore(data.has_more)
    } finally {
      setIsLoadingMore(false)
    }
  }, [nextCursor, isLoadingMore, filterQs])

  function handleFilterChange(newFilter: JournalFilter) {
    setSelectedArticle(null)
    setFilter({ ...newFilter, cursor: undefined })
  }

  function handleViewArticles() {
    setActiveTab("browse")
  }

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="🔬 Scholar" />
      <div className="p-3 md:p-6 max-w-5xl w-full">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-zinc-800 border border-zinc-700 mb-4 md:mb-6 flex-wrap h-auto gap-0.5 p-1">
            <TabsTrigger value="dashboard" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-zinc-400">
              📊 Dashboard
            </TabsTrigger>
            <TabsTrigger value="browse" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-zinc-400">
              논문 탐색
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-4">
            <DashboardCharts onViewArticles={handleViewArticles} />
          </TabsContent>

          <TabsContent value="browse" className="space-y-4">
            {selectedArticle ? (
              <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900">
                <ArticleDetail
                  article={selectedArticle}
                  onBack={() => setSelectedArticle(null)}
                />
              </div>
            ) : (
              <>
                <ArticleFilter filter={filter} onFilterChange={handleFilterChange} stats={stats} />
                {isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full bg-zinc-800" />
                    ))}
                  </div>
                ) : error ? (
                  <p className="text-red-400 text-sm text-center py-8">
                    로딩 실패: {(error as Error).message}
                  </p>
                ) : (
                  <ArticleList
                    articles={allArticles}
                    hasMore={hasMore}
                    isLoadingMore={isLoadingMore}
                    onLoadMore={handleLoadMore}
                    onSelect={setSelectedArticle}
                  />
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
