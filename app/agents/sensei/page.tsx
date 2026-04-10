"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { TopBar } from "@/components/layout/TopBar"
import { AgentGreeter } from "@/components/layout/AgentGreeter"
import { SenseiCalendar } from "@/components/sensei/SenseiCalendar"
import { SenseiCapture } from "@/components/sensei/SenseiCapture"
import { SenseiDashboard } from "@/components/sensei/SenseiDashboard"
import { SenseiStats } from "@/components/sensei/SenseiStats"
import { SenseiStrategy } from "@/components/sensei/SenseiStrategy"
import { SenseiCompetition } from "@/components/sensei/SenseiCompetition"
import { SenseiNavMap } from "@/components/sensei/SenseiNavMap"
import type { BjjStats } from "@/lib/types/sensei"

type SenseiTab = "dashboard" | "skilltree" | "journal" | "strategy" | "map" | "competition"

const TABS: { id: SenseiTab; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "🎯" },
  { id: "skilltree", label: "Skill Tree", icon: "🌳" },
  { id: "map", label: "Map", icon: "🗺️" },
  { id: "journal", label: "Journal", icon: "📓" },
  { id: "strategy", label: "Strategy", icon: "🎯" },
  { id: "competition", label: "Competition", icon: "📅" },
]

export default function SenseiPage() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<SenseiTab>("dashboard")

  const { data, isLoading } = useQuery<{ stats: BjjStats }>({
    queryKey: ["sensei-stats"],
    queryFn: async () => {
      const res = await fetch("/api/notion/sensei/stats")
      if (!res.ok) throw new Error("스탯 조회 실패")
      return res.json()
    },
  })

  const stats = data?.stats
  let message: string
  if (!stats) {
    message = "Tak, 오늘도 매트에서 보자. 한 라운드면 충분해."
  } else if (stats.streaks.current >= 5) {
    message = `${stats.streaks.current}일 연속이야 Tak, 올해 ${stats.sessions2026}회. 페이스 진짜 좋아 — 이대로 가자.`
  } else if (stats.streaks.current >= 3) {
    message = `${stats.streaks.current}일 연속 좋아 Tak. 올해 ${stats.sessions2026}회 찍었네. 오늘도 한 판 가볍게 하고 가자.`
  } else if (stats.streaks.current === 0) {
    message = `Tak, 며칠 쉬었지? 올해 ${stats.sessions2026}회 찍었으니까 오늘 다시 올라와. 가볍게라도, 형이 옆에서 봐줄게.`
  } else {
    message = `Tak, 이번 주 ${stats.streaks.current}일. 올해 ${stats.sessions2026}회. 꾸준함이 답이야 — 오늘도 매트에서 보자.`
  }

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="" />

      {/* Tab Navigation */}
      <div className="border-b border-border bg-background sticky top-0 z-10 overflow-x-auto">
        <div className="flex gap-0.5 px-3 md:px-6 max-w-5xl min-w-max">
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

      {/* Tab Content */}
      <div className={`${
        activeTab === "dashboard" ? "p-3 md:p-6 max-w-6xl"
        : activeTab === "strategy" || activeTab === "map" ? "p-3 md:p-6 max-w-7xl"
        : "p-3 md:p-6 max-w-5xl"
      } w-full`}>
        <AgentGreeter image="/lo.png" name="Lo" message={message} loading={isLoading} />

        {activeTab === "dashboard" && (
          <SenseiDashboard onNavigate={(tab) => setActiveTab(tab as SenseiTab)} />
        )}

        {activeTab === "skilltree" && <SenseiStats />}

        {activeTab === "journal" && (
          <div>
            <SenseiCalendar onDateSelect={setSelectedDate} />
            <div className="mt-4" />
            <SenseiCapture selectedDate={selectedDate} />
          </div>
        )}

        {activeTab === "map" && <SenseiNavMap />}
        {activeTab === "strategy" && <SenseiStrategy />}
        {activeTab === "competition" && <SenseiCompetition />}
      </div>
    </div>
  )
}
