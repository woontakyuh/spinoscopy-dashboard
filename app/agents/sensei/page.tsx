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
import type { BjjStats } from "@/lib/types/sensei"

type SenseiTab = "dashboard" | "skilltree" | "journal" | "strategy" | "competition"

const TABS: { id: SenseiTab; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "🎯" },
  { id: "skilltree", label: "Skill Tree", icon: "🌳" },
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
    message = "오늘도 매트에서 봅시다. 한 라운드면 충분해요."
  } else if (stats.streaks.current >= 3) {
    message = `${stats.streaks.current}일 연속, 올해 ${stats.sessions2026}회. 페이스 좋습니다. 이대로 한 단계만 더.`
  } else if (stats.streaks.current === 0) {
    message = `잠깐 쉬셨네요. 올해 누적 ${stats.sessions2026}회. 오늘 매트 위에 다시 올라가시죠 — 가볍게라도.`
  } else {
    message = `이번 주 ${stats.streaks.current}일 매트. 올해 ${stats.sessions2026}회. 꾸준함이 답입니다, 선생님.`
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
        : activeTab === "strategy" ? "p-3 md:p-6 max-w-7xl"
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

        {activeTab === "strategy" && <SenseiStrategy />}
        {activeTab === "competition" && <SenseiCompetition />}
      </div>
    </div>
  )
}
