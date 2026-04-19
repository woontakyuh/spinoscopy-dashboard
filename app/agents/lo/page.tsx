"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { TopBar } from "@/components/layout/TopBar"
import { AgentChat } from "@/components/layout/AgentChat"
import { SenseiDashboard } from "@/components/sensei/SenseiDashboard"
import { HomeOverview } from "@/components/lo/HomeOverview"
import { ConceptsFeed } from "@/components/lo/ConceptsFeed"
import { WorkingHypothesisBanner } from "@/components/lo/WorkingHypothesisBanner"
import { NavMapWrapper } from "@/components/lo/NavMapWrapper"
import { TrainingLog } from "@/components/lo/TrainingLog"
import { CompetitionsView } from "@/components/lo/CompetitionsView"
import { getTimeContext } from "@/lib/greeterContext"
import type { BjjStats, BjjAttributes, SenseiEntry } from "@/lib/types/sensei"

type LoTab = "home" | "character" | "navmap" | "training" | "competitions" | "concepts"

const TABS: { id: LoTab; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "🏠" },
  { id: "character", label: "Character", icon: "🥋" },
  { id: "navmap", label: "NavMap", icon: "🗺️" },
  { id: "training", label: "Training", icon: "📓" },
  { id: "competitions", label: "Competitions", icon: "🏆" },
  { id: "concepts", label: "Concepts", icon: "💡" },
]

function getHighLow(attrs: BjjAttributes): { highest: string; lowest: string } {
  const entries = Object.entries(attrs) as [string, number][]
  entries.sort((a, b) => b[1] - a[1])
  return { highest: entries[0][0], lowest: entries[entries.length - 1][0] }
}

export default function LoPage() {
  const [activeTab, setActiveTab] = useState<LoTab>("home")

  const { data, isLoading: isStatsLoading } = useQuery<{ stats: BjjStats }>({
    queryKey: ["sensei-stats"],
    queryFn: async () => {
      const res = await fetch("/api/notion/sensei/stats")
      if (!res.ok) throw new Error("스탯 조회 실패")
      return res.json()
    },
  })

  const { data: entriesData, isLoading: isEntriesLoading } = useQuery<SenseiEntry[]>({
    queryKey: ["sensei-entries"],
    queryFn: async () => {
      const res = await fetch("/api/notion/sensei")
      if (!res.ok) throw new Error("훈련 기록 조회 실패")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const stats = data?.stats
  const entries = entriesData ?? []

  function getMessageForTab(tab: LoTab): string {
    const tc = getTimeContext()

    if (tab === "home") {
      if (!stats) return "Tak, 왔어? 오늘 컨디션 어때."
      return `Tak, 올해 ${stats.sessions2026}회 매트. ${stats.streaks.current}주 연속. 홈에서 뭐부터 볼래.`
    }

    if (tab === "character") {
      if (!stats) return "Tak, 아직 데이터 부족. 훈련 기록 좀 더 쌓자."
      const { highest, lowest } = getHighLow(stats.combined.attributes)
      return `Tak, 지금 네 강점은 ${highest}야. ${lowest}는 좀 더 갈고닦자.`
    }

    if (tab === "navmap") {
      if (!stats) return "Tak, NavMap에 들어왔네. 노드 하나 눌러봐."
      const { highest, lowest } = getHighLow(stats.combined.attributes)
      return `Tak, 맵 넓지? ${highest}는 불 들어와있고 ${lowest} 쪽은 더 파야 돼.`
    }

    if (tab === "training") {
      const now = new Date()
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
      const monthEntries = entries.filter((e) => e.date && e.date.startsWith(thisMonth))
      if (monthEntries.length > 0) {
        const sorted = monthEntries.slice().sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
        const lastDate = sorted[0].date?.slice(5, 10).replace("-", "/") ?? ""
        const count = monthEntries.length
        return `Tak, 이번 달 ${count}회, 마지막은 ${lastDate}. ${count < 5 ? "조금 더 올라와야지." : "꾸준하다. 계속 가자."}`
      }
      return "Tak, 이번 달 아직 기록이 없어. 오늘 시작하자."
    }

    if (tab === "competitions") {
      if (stats) {
        return `Tak, ${stats.belt} belt, 올해 ${stats.sessions2026}회. 대회 목표 잡아보자.`
      }
      return "Tak, 대회 일정 여기서 관리해. 목표 하나 잡아두자."
    }

    if (tab === "concepts") {
      return "Tak, 개념 노트 쌓이는 공간이야. Desktop에서 적어둔 거 여기서 다시 보자."
    }

    // fallback — time context 기반
    if (tc.bucket === "morning") return "Tak, 오늘 아침 훈련 가능해? 한 라운드면 충분해."
    if (tc.bucket === "evening") return "Tak, 오늘 하루 어땠어? 매트 위에서 정리하고 가자."
    return "Tak, 오늘도 매트에서 보자."
  }

  const message = getMessageForTab(activeTab)
  const isTabLoading =
    (activeTab === "character" && isStatsLoading) ||
    (activeTab === "navmap" && isStatsLoading) ||
    (activeTab === "training" && isEntriesLoading) ||
    (activeTab === "competitions" && isStatsLoading) ||
    (activeTab === "home" && isStatsLoading)

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="" />

      {/* Tabs */}
      <div className="border-b border-border bg-background sticky top-0 z-10 overflow-x-auto">
        <div className="flex gap-0.5 px-3 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`
                px-3 py-2.5 text-xs sm:text-sm font-medium transition-colors relative whitespace-nowrap
                ${activeTab === tab.id ? "text-foreground" : "text-muted-foreground hover:text-foreground/90"}
              `}
            >
              <span className="flex items-center gap-1.5">
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </span>
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 p-3 md:p-6">
        <AgentChat agentId="lo" image="/lo.png" name="Lo" greeting={isTabLoading ? "..." : message} />

        {/* Persistent Working Hypothesis banner (Phase 2에서 데이터 연결) */}
        <WorkingHypothesisBanner />

        {activeTab === "home" && <HomeOverview goTo={(t) => setActiveTab(t as LoTab)} />}

        {activeTab === "character" && (
          <SenseiDashboard onNavigate={(t) => setActiveTab(t as LoTab)} />
        )}

        {activeTab === "navmap" && <NavMapWrapper />}

        {activeTab === "training" && <TrainingLog />}

        {activeTab === "competitions" && <CompetitionsView />}

        {activeTab === "concepts" && <ConceptsFeed />}
      </div>
    </div>
  )
}
