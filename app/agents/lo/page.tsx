"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { TopBar } from "@/components/layout/TopBar"
import { AgentChat } from "@/components/layout/AgentChat"
import { SenseiCalendar } from "@/components/sensei/SenseiCalendar"
import { SenseiCapture } from "@/components/sensei/SenseiCapture"
import { SenseiDashboard } from "@/components/sensei/SenseiDashboard"
import { SenseiCompetition } from "@/components/sensei/SenseiCompetition"
import { SenseiNavMap } from "@/components/sensei/SenseiNavMap"
import { getTimeContext } from "@/lib/greeterContext"
import type { BjjStats, BjjAttributes, SenseiEntry } from "@/lib/types/sensei"

type SenseiTab = "dashboard" | "map" | "journal" | "competition"

const TABS: { id: SenseiTab; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "🎯" },
  { id: "map", label: "Map", icon: "🗺️" },
  { id: "journal", label: "Journal", icon: "📓" },
  { id: "competition", label: "Competition", icon: "📅" },
]

function getHighLow(attrs: BjjAttributes): { highest: string; lowest: string } {
  const entries = Object.entries(attrs) as [string, number][]
  entries.sort((a, b) => b[1] - a[1])
  return { highest: entries[0][0], lowest: entries[entries.length - 1][0] }
}

export default function SenseiPage() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<SenseiTab>("dashboard")

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

  function getMessageForTab(tab: SenseiTab): string {
    const tc = getTimeContext()

    if (tab === "map") {
      if (!stats) return "Tak, 기술 맵 아직 데이터가 부족해. 훈련 좀 더 쌓자."
      const { highest, lowest } = getHighLow(stats.combined.attributes)
      return `Tak, 지금 네 강점은 ${highest}야. ${lowest}는 좀 더 갈고닦자.`
    }

    if (tab === "journal") {
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

    if (tab === "competition") {
      if (stats) {
        return `Tak, ${stats.belt} belt, 올해 ${stats.sessions2026}회 훈련. 대회 목표 잡아보자.`
      }
      return "Tak, 대회 일정 여기서 관리해. 목표 하나 잡아두자."
    }

    // dashboard 탭 — stats 기반 + 시간맥락
    if (!stats) {
      if (tc.bucket === "morning") return "Tak, 오늘 아침 훈련 가능해? 한 라운드면 충분해."
      if (tc.bucket === "evening") return "Tak, 오늘 하루 어땠어? 매트 위에서 정리하고 가자."
      return "Tak, 오늘도 매트에서 보자. 한 라운드면 충분해."
    }
    if (tc.bucket === "morning" && stats.streaks.current === 0) {
      return `Tak, 오늘 아침 훈련 가능해? 며칠 쉬었으니까 가볍게라도 올라와. 올해 ${stats.sessions2026}회.`
    }
    if (tc.bucket === "evening") {
      return `Tak, 오늘 하루 어땠어? 올해 ${stats.sessions2026}회. 매트 위에서 정리하고 가자.`
    }
    if (stats.streaks.current >= 5) return `${stats.streaks.current}일 연속이야 Tak, 올해 ${stats.sessions2026}회. 페이스 진짜 좋아 — 이대로 가자.`
    if (stats.streaks.current >= 3) return `${stats.streaks.current}일 연속 좋아 Tak. 올해 ${stats.sessions2026}회 찍었네. 오늘도 한 판 가볍게 하고 가자.`
    if (stats.streaks.current === 0) return `Tak, 며칠 쉬었지? 올해 ${stats.sessions2026}회 찍었으니까 오늘 다시 올라와. 가볍게라도, 형이 옆에서 봐줄게.`
    return `Tak, 이번 주 ${stats.streaks.current}일. 올해 ${stats.sessions2026}회. 꾸준함이 답이야 — 오늘도 매트에서 보자.`
  }

  const message = getMessageForTab(activeTab)
  const isTabLoading =
    (activeTab === "dashboard" && isStatsLoading) ||
    (activeTab === "map" && isStatsLoading) ||
    (activeTab === "journal" && isEntriesLoading) ||
    (activeTab === "competition" && isStatsLoading)

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

        {activeTab === "dashboard" && (
          <SenseiDashboard onNavigate={(tab) => setActiveTab(tab as SenseiTab)} />
        )}

        {activeTab === "journal" && (
          <div>
            <SenseiCalendar onDateSelect={setSelectedDate} />
            <div className="mt-4" />
            <SenseiCapture selectedDate={selectedDate} />
          </div>
        )}

        {activeTab === "map" && <SenseiNavMap />}
        {activeTab === "competition" && <SenseiCompetition />}
      </div>
    </div>
  )
}
