"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { TopBar } from "@/components/layout/TopBar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArticleFilter } from "@/components/scholar/ArticleFilter"
import { ArticleList } from "@/components/scholar/ArticleList"
import { ArticleDetail } from "@/components/scholar/ArticleDetail"
import { StatsOverview } from "@/components/scholar/StatsOverview"
import { JournalTrend } from "@/components/scholar/JournalTrend"
import type { JournalArticle, JournalFilter, JournalStats } from "@/lib/types/journal"

export default function ScholarPage() {
  const [selectedArticle, setSelectedArticle] = useState<JournalArticle | null>(null)
  const [filter, setFilter] = useState<JournalFilter>({
    interest: "all",
    journal: "all",
    read: "all",
    sort: "date_desc",
  })

  const { data: stats } = useQuery<JournalStats>({
    queryKey: ["journal", "stats"],
    queryFn: async () => {
      const res = await fetch("/api/notion/journal?action=stats")
      if (!res.ok) throw new Error("통계 조회 실패")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  function handleSelect(article: JournalArticle) {
    if (article.page_id === "__load_more__") return
    setSelectedArticle(article)
  }

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="🔬 Scholar" />
      <div className="p-6 max-w-4xl w-full">
        <Tabs defaultValue="browse">
          <TabsList className="bg-zinc-800 border border-zinc-700 mb-6">
            <TabsTrigger value="browse" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-zinc-400">
              논문 탐색
            </TabsTrigger>
            <TabsTrigger value="stats" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white text-zinc-400">
              📊 통계
            </TabsTrigger>
          </TabsList>

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
                <ArticleFilter filter={filter} onFilterChange={setFilter} />
                <ArticleList
                  filter={filter}
                  onSelect={handleSelect}
                />
              </>
            )}
          </TabsContent>

          <TabsContent value="stats" className="space-y-4">
            <StatsOverview />
            <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900">
              <JournalTrend stats={stats} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
