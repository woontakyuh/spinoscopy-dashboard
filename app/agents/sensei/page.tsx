"use client"

import { useState } from "react"
import { TopBar } from "@/components/layout/TopBar"
import { SenseiCapture } from "@/components/sensei/SenseiCapture"
import { SenseiCalendar } from "@/components/sensei/SenseiCalendar"
import { SenseiDashboard } from "@/components/sensei/SenseiDashboard"
import { SenseiStats } from "@/components/sensei/SenseiStats"
import { SenseiStrategy } from "@/components/sensei/SenseiStrategy"
import { SenseiCompetition } from "@/components/sensei/SenseiCompetition"

type SenseiTab = "dashboard" | "skilltree" | "journal" | "strategy" | "competition"

const TABS: { id: SenseiTab; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "\ud83c\udfe0" },
  { id: "skilltree", label: "Skill Tree", icon: "\ud83c\udf33" },
  { id: "journal", label: "Journal", icon: "\ud83d\udcdd" },
  { id: "strategy", label: "Strategy", icon: "\ud83c\udfaf" },
  { id: "competition", label: "Competition", icon: "\ud83d\udcc5" },
]

export default function SenseiPage() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<SenseiTab>("dashboard")

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="Lo" icon="/lo.png" />

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
