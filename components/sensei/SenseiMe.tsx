"use client"

import { useState } from "react"
import { SenseiCharacterSheet } from "./SenseiCharacterSheet"
import { SenseiStats } from "./SenseiStats"

type MeView = "character" | "stats"

export function SenseiMe() {
  const [view, setView] = useState<MeView>("character")

  return (
    <div className="space-y-4">
      {/* Sub-toggle */}
      <div className="flex gap-1">
        <button
          onClick={() => setView("character")}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            view === "character"
              ? "bg-zinc-800 text-white border border-zinc-700"
              : "text-zinc-500 border border-zinc-800/50 hover:text-zinc-300"
          }`}
        >
          ⚔️ 캐릭터
        </button>
        <button
          onClick={() => setView("stats")}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            view === "stats"
              ? "bg-zinc-800 text-white border border-zinc-700"
              : "text-zinc-500 border border-zinc-800/50 hover:text-zinc-300"
          }`}
        >
          📊 능력치 상세
        </button>
      </div>

      {view === "character" && <SenseiCharacterSheet />}
      {view === "stats" && <SenseiStats />}
    </div>
  )
}
