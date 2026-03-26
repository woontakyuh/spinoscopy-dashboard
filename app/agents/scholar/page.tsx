"use client"

import { useState } from "react"
import { TopBar } from "@/components/layout/TopBar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MyPapers } from "@/components/scholar/MyPapers"
import { DashboardCharts } from "@/components/scholar/DashboardCharts"
import { PaperDB } from "@/components/scholar/PaperDB"
import { ResearchPipeline } from "@/components/scholar/ResearchPipeline"

export default function ScholarPage() {
  const [activeTab, setActiveTab] = useState("my-papers")

  function handleViewArticles() {
    setActiveTab("browse")
  }

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="🔬 Scholar" />
      <div className="p-3 md:p-6 max-w-5xl w-full">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-zinc-800 border border-zinc-700 mb-4 md:mb-6 flex-wrap h-auto gap-0.5 p-1">
            <TabsTrigger value="my-papers" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-zinc-400">
              My Papers
            </TabsTrigger>
            <TabsTrigger value="research" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-zinc-400">
              My Research
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-zinc-400">
              UpToDate
            </TabsTrigger>
            <TabsTrigger value="browse" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-zinc-400">
              Journal DB
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
        </Tabs>
      </div>
    </div>
  )
}
