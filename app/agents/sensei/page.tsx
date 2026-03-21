"use client"

import { useState } from "react"
import { TopBar } from "@/components/layout/TopBar"
import { SenseiCapture } from "@/components/sensei/SenseiCapture"
import { SenseiCalendar } from "@/components/sensei/SenseiCalendar"
import { SenseiCharacterSheet } from "@/components/sensei/SenseiCharacterSheet"
import { SenseiSkillTree } from "@/components/sensei/SenseiSkillTree"
import { SenseiHeroes } from "@/components/sensei/SenseiHeroes"

type SenseiTab = "journal" | "character" | "skilltree" | "heroes"

const TABS: { id: SenseiTab; label: string; icon: string }[] = [
  { id: "journal", label: "Journal", icon: "\ud83d\udcdd" },
  { id: "character", label: "Character", icon: "\u2694\ufe0f" },
  { id: "skilltree", label: "Skill Tree", icon: "\ud83c\udf33" },
  { id: "heroes", label: "BJJ Heroes", icon: "\ud83c\udfc6" },
]

export default function SenseiPage() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<SenseiTab>("journal")

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="\ud83e\udd4b Sensei" />

      {/* Tab Navigation */}
      <div className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-10">
        <div className="flex gap-1 px-3 md:px-6 max-w-5xl">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`
                px-3 py-2.5 text-sm font-medium transition-colors relative
                ${activeTab === tab.id
                  ? "text-white"
                  : "text-zinc-500 hover:text-zinc-300"
                }
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
      <div className="p-3 md:p-6 max-w-5xl w-full">
        {activeTab === "journal" && (
          <div>
            <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900 mb-4">
              <p className="text-zinc-300 text-sm">
                자연어로 수련 내용을 입력하면 Sensei가 Notion 태그(Class/Sparring)까지 자동으로 정리해서 저장합니다.
              </p>
            </div>
            <SenseiCalendar onDateSelect={setSelectedDate} />
            <div className="mt-4" />
            <SenseiCapture selectedDate={selectedDate} />
          </div>
        )}

        {activeTab === "character" && <SenseiCharacterSheet />}
        {activeTab === "skilltree" && <SenseiSkillTree />}
        {activeTab === "heroes" && <SenseiHeroes />}
      </div>
    </div>
  )
}
