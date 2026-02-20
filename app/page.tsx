"use client"

import { useRef } from "react"
import { TopBar } from "@/components/layout/TopBar"
import { AgentGrid } from "@/components/dashboard/AgentGrid"
import { OrchestratorChat } from "@/components/dashboard/OrchestratorChat"
import { MorningBriefing } from "@/components/dashboard/MorningBriefing"

export default function DashboardPage() {
  const chatRef = useRef<HTMLDivElement>(null)

  function scrollToChat() {
    chatRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="Dashboard" />
      <div className="flex-1 p-6 max-w-5xl space-y-6">
        <AgentGrid onChatClick={scrollToChat} />

        <div ref={chatRef}>
          <OrchestratorChat />
        </div>

        <MorningBriefing />
      </div>
    </div>
  )
}
