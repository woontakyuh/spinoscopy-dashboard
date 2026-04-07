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

  const message = !stats
    ? "최신 논문을 정리하고 있어요."
    : `이번 주 새 논문 ${stats.recent_week}편 들어왔어요. 총 ${stats.total}편 중 핵심부터 짚어드릴게요.`

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="" />
      <div className="p-3 md:p-6 max-w-5xl w-full">
        <AgentGreeter image="/brian.png" name="Brian" message={message} loading={isLoading} />
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted border border-border mb-4 md:mb-6 flex-wrap h-auto gap-0.5 p-1">
            <TabsTrigger value="my-papers" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-muted-foreground">
              My Papers
            </TabsTrigger>
            <TabsTrigger value="research" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-muted-foreground">
              My Research
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-muted-foreground">
              UpToDate
            </TabsTrigger>
            <TabsTrigger value="browse" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-muted-foreground">
              Journal DB
            </TabsTrigger>
            <TabsTrigger value="editorial" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-muted-foreground">
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
