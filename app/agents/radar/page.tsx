"use client"

import { TopBar } from "@/components/layout/TopBar"
import { RadarFeed } from "@/components/radar/RadarFeed"

export default function RadarPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="🛰️ Radar" />
      <div className="p-3 md:p-6 max-w-4xl w-full">
        <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900 mb-4">
          <p className="text-zinc-300 text-sm">
            AI/기술 뉴스를 자동으로 수집하고, 한줄 요약 후 Obsidian에 저장할 수 있습니다.
          </p>
        </div>
        <RadarFeed />
      </div>
    </div>
  )
}
