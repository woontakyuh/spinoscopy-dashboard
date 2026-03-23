"use client"

import { useState } from "react"
import { TopBar } from "@/components/layout/TopBar"
import { SenseiCapture } from "@/components/sensei/SenseiCapture"
import { SenseiCalendar } from "@/components/sensei/SenseiCalendar"
import { SenseiDashboard } from "@/components/sensei/SenseiDashboard"
import { SenseiStats } from "@/components/sensei/SenseiStats"
import { SenseiHeroes } from "@/components/sensei/SenseiHeroes"
import { SenseiCompetition } from "@/components/sensei/SenseiCompetition"
import { SenseiCoach } from "@/components/sensei/SenseiCoach"
import { SenseiCharacterSheet } from "@/components/sensei/SenseiCharacterSheet"

type SenseiTab = "dashboard" | "character" | "journal" | "stats" | "heroes" | "competition" | "coach"

const TABS: { id: SenseiTab; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "\ud83c\udfe0" },
  { id: "character", label: "Character", icon: "\u2694\ufe0f" },
  { id: "journal", label: "Journal", icon: "\ud83d\udcdd" },
  { id: "stats", label: "Stats", icon: "\ud83d\udcca" },
  { id: "heroes", label: "BJJ Heroes", icon: "\ud83c\udfc6" },
  { id: "competition", label: "Competition", icon: "\ud83d\udcc5" },
  { id: "coach", label: "Coach", icon: "\ud83e\udd16" },
]

export default function SenseiPage() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<SenseiTab>("dashboard")
  const [coachInitialQuestion, setCoachInitialQuestion] = useState<string | null>(null)

  function navigateToCoach(question?: string) {
    if (question) setCoachInitialQuestion(question)
    setActiveTab("coach")
  }

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="\ud83e\udd4b Sensei" />

      {/* Tab Navigation */}
      <div className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-10 overflow-x-auto">
        <div className="flex gap-0.5 px-3 md:px-6 max-w-5xl min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`
                px-2.5 py-2.5 text-xs sm:text-sm font-medium transition-colors relative whitespace-nowrap
                ${activeTab === tab.id
                  ? "text-white"
                  : "text-zinc-500 hover:text-zinc-300"
                }
              `}
            >
              <span className="flex items-center gap-1">
                <span className="hidden sm:inline">{tab.icon}</span>
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
      <div className={`${activeTab === "dashboard" ? "p-3 md:p-6 max-w-6xl" : "p-3 md:p-6 max-w-5xl"} w-full`}>
        {activeTab === "dashboard" && (
          <SenseiDashboard
            onNavigate={(tab) => setActiveTab(tab as SenseiTab)}
            onAskCoach={navigateToCoach}
          />
        )}

        {activeTab === "character" && <SenseiCharacterSheet />}

        {activeTab === "journal" && (
          <div>
            <SenseiCalendar onDateSelect={setSelectedDate} />
            <div className="mt-4" />
            <SenseiCapture selectedDate={selectedDate} />
          </div>
        )}

        {activeTab === "stats" && <SenseiStats />}
        {activeTab === "heroes" && <SenseiHeroes />}
        {activeTab === "competition" && <SenseiCompetition />}
        {activeTab === "coach" && (
          <SenseiCoach
            initialQuestion={coachInitialQuestion}
            onQuestionConsumed={() => setCoachInitialQuestion(null)}
          />
        )}
      </div>
    </div>
  )
}
