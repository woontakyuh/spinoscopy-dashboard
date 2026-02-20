"use client"

import { TopBar } from "@/components/layout/TopBar"
import { OrchestratorChat } from "@/components/dashboard/OrchestratorChat"
import { AgentGrid } from "@/components/dashboard/AgentGrid"
import { TodaySurgery } from "@/components/dashboard/TodaySurgery"
import { MorningBriefing } from "@/components/dashboard/MorningBriefing"

export default function DashboardPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="Dashboard" />
      <div className="flex-1 p-6 max-w-6xl w-full space-y-6">
        <MorningBriefing />

        <OrchestratorChat />

        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-gradient-to-r from-cyan-500/40 to-transparent" />
            <span className="text-zinc-500 text-xs tracking-wider uppercase">Sub-Agents</span>
            <div className="h-px flex-1 bg-gradient-to-l from-cyan-500/40 to-transparent" />
          </div>
          <AgentGrid />
        </div>

        <TodaySurgery />
      </div>
    </div>
  )
}
