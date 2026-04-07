"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { TopBar } from "@/components/layout/TopBar"
import { AgentGreeter } from "@/components/layout/AgentGreeter"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MyPapers } from "@/components/scholar/MyPapers"
import { DashboardCharts } from "@/components/scholar/DashboardCharts"
import { PaperDB } from "@/components/scholar/PaperDB"
import { ResearchPipeline } from "@/components/scholar/ResearchPipeline"
import { Editorial } from "@/components/scholar/Editorial"
import type { JournalStats } from "@/lib/types/journal"

export default function ScholarPage() {
  const [activeTab, setActiveTab] = useState("my-papers")

  const { data: stats, isLoading } = useQuery<JournalStats>({
    queryKey: ["journal", "stats"],
    queryFn: async () => {
      const res = await fetch("/api/notion/journal?action=stats")
      if (!res.ok) throw new Error("통계 조회 실패")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  function handleViewArticles() {
    setActiveTab("browse")
  }

  let message: string
  if (!stats) {
    message = "여교수, 최신 저널들 좀 정리해두고 있네. 흥미로운 게 있으면 짚어주겠네."
  } else if (stats.recent_week === 0) {
    message = `여교수, 이번 주엔 새로 들어온 게 없군. 그동안 모아둔 ${stats.total}편 중에 다시 들여다볼 만한 거 찾아볼까.`
  } else if (stats.recent_week >= 10) {
    message = `여교수, 이번 주 ${stats.recent_week}편이나 올라왔네. 풍년이야 — spine 쪽 핵심부터 같이 보세.`
  } else {
    message = `여교수, 이번 주 새 논문 ${stats.recent_week}편 들어왔네. 몇 편 눈여겨볼 만한 게 있던데, 한번 훑어보게.`
  }

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="" />
      <div className="p-3 md:p-6 max-w-5xl w-full">
        <AgentGreeter image="/brian.png" name="Brian" message={message} loading={isLoading} />
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted border border-border mb-4 md:mb-6 gap-1 p-1 [&]:!grid [&]:!w-full [&]:!h-auto grid-cols-3 md:grid-cols-5">
            <TabsTrigger value="my-papers" className="min-h-9 data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-muted-foreground text-xs md:text-sm">
              My Papers
            </TabsTrigger>
            <TabsTrigger value="research" className="min-h-9 data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-muted-foreground text-xs md:text-sm">
              My Research
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="min-h-9 data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-muted-foreground text-xs md:text-sm">
              UpToDate
            </TabsTrigger>
            <TabsTrigger value="browse" className="min-h-9 data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-muted-foreground text-xs md:text-sm">
              Journal DB
            </TabsTrigger>
            <TabsTrigger value="editorial" className="min-h-9 data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-muted-foreground text-xs md:text-sm">
              Editorial
            </TabsTrigger>
          </TabsList>

          <TabsContent value="my-papers" className="space-y-4">
            <MyPapers />
          </TabsContent>

          <TabsContent value="research" className="space-y-4">
            <ResearchPipeline />
          </TabsContent>

          <TabsContent value="dashboard" className="space-y-4">
            <DashboardCharts onViewArticles={handleViewArticles} />
          </TabsContent>

          <TabsContent value="browse" className="space-y-4">
            <PaperDB />
          </TabsContent>

          <TabsContent value="editorial" className="space-y-4">
            <Editorial />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
