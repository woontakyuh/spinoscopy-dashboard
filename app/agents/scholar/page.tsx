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
import type { ResearchProject } from "@/lib/types/research"

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

  const { data: research } = useQuery<ResearchProject[]>({
    queryKey: ["research-projects"],
    queryFn: async () => {
      const res = await fetch("/api/notion/research")
      if (!res.ok) throw new Error("연구 조회 실패")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  function handleViewArticles() {
    setActiveTab("browse")
  }

  // ─── 메시지 풀: 저널 업데이트 + 연구 진행 둘 다 ───
  function buildMessages(): string[] {
    const out: string[] = []

    // 저널 업데이트 풀
    if (stats) {
      if (stats.recent_week === 0) {
        out.push(`여교수, 이번 주엔 새로 들어온 게 없군. 그동안 모아둔 ${stats.total}편 중에 다시 들여다볼 만한 거 찾아볼까.`)
      } else if (stats.recent_week >= 10) {
        out.push(`여교수, 이번 주 ${stats.recent_week}편이나 올라왔네. 풍년이야 — spine 쪽 핵심부터 같이 보세.`)
      } else {
        out.push(`여교수, 이번 주 새 논문 ${stats.recent_week}편 들어왔네. 몇 편 눈여겨볼 만한 게 있던데, 한번 훑어보게.`)
      }
    }

    // 연구 진행 풀
    if (research && research.length > 0) {
      const drafting = research.filter((r) => r.status === "Drafting" || r.status === "Editing").length
      const submitted = research.filter((r) => r.status === "Submitted" || r.status === "2nd Review").length
      const revision = research.filter((r) => r.status === "Revision").length
      const accepted = research.filter((r) => r.status === "Accepted").length
      const idea = research.filter((r) => r.status === "Idea" || r.status === "Lit Review").length

      if (revision > 0) {
        out.push(`여교수, Revision 중인 논문 ${revision}편 있던데, 마감 챙기게. 리뷰어 코멘트 한번 같이 보겠나?`)
      }
      if (submitted > 0) {
        out.push(`여교수, Submitted 상태가 ${submitted}편이군. 결과 기다리는 게 제일 길지. 그동안 다음 거 준비해두세.`)
      }
      if (accepted > 0) {
        out.push(`여교수, Accepted ${accepted}편 — 축하하네. 잘하고 있어.`)
      }
      if (drafting > 0) {
        out.push(`여교수, Drafting 단계 ${drafting}편 있네. 막히는 부분 있으면 같이 보세.`)
      }
      if (idea > 0) {
        out.push(`여교수, Idea·Lit Review 단계가 ${idea}편이군. 그중 하나 골라서 본격적으로 굴려보는 건 어떤가.`)
      }
      if (revision === 0 && submitted === 0 && drafting === 0) {
        out.push(`여교수, 진행 중인 논문이 ${research.length}편이군. 새 주제 하나 잡아볼 때도 됐네.`)
      }
    }

    return out.length > 0 ? out : ["여교수, 최신 저널들 좀 정리해두고 있네. 흥미로운 게 있으면 짚어주겠네."]
  }

  // 날짜 시드로 결정적 픽 (같은 날엔 같은 메시지)
  const messages = buildMessages()
  const dateKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
  let h = 2166136261
  for (let i = 0; i < dateKey.length; i++) { h ^= dateKey.charCodeAt(i); h = Math.imul(h, 16777619) }
  const message = messages[(h >>> 0) % messages.length]

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
