"use client"

import { TopBar } from "@/components/layout/TopBar"
import { AgentGrid } from "@/components/dashboard/AgentGrid"
import { TodaySurgery } from "@/components/dashboard/TodaySurgery"
import { TodayTodo } from "@/components/dashboard/TodayTodo"
import { MorningBriefing } from "@/components/dashboard/MorningBriefing"
import { MonthCalendar } from "@/components/dashboard/MonthCalendar"
import { ConferenceSchedule } from "@/components/dashboard/ConferenceSchedule"

export default function DashboardPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="Home" />
      <div className="flex-1 p-3 md:p-6 max-w-7xl w-full space-y-4 md:space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-gradient-to-r from-cyan-500/40 to-transparent" />
            <span className="text-zinc-500 text-xs tracking-wider uppercase">Sub-Agents</span>
            <div className="h-px flex-1 bg-gradient-to-l from-cyan-500/40 to-transparent" />
          </div>
          <AgentGrid />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 items-stretch">
          <MorningBriefing />
          <MonthCalendar />
          <ConferenceSchedule />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TodaySurgery />
          <TodayTodo />
        </div>

      </div>
    </div>
  )
}
