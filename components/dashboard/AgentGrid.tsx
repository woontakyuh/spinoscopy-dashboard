"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"

const AGENTS = [
  { icon: "🩺", name: "Clinicus", desc: "임상 보조 · 환자 데이터", active: true, href: "/agents/clinicus", color: "bg-red-500/20" },
  { icon: "🔬", name: "Scholar", desc: "논문 탐색 · 연구 분석", active: true, href: "/agents/scholar", color: "bg-blue-500/20" },
  { icon: "🎓", name: "Maestro", desc: "교육 · 강의 관리", active: false, href: "#", color: "bg-purple-500/20" },
  { icon: "📋", name: "Jarvis", desc: "일정 · 업무 관리", active: false, href: "#", color: "bg-green-500/20" },
  { icon: "💰", name: "Vault", desc: "재무 · 정산 관리", active: false, href: "#", color: "bg-amber-500/20" },
  { icon: "🥋", name: "Sensei", desc: "수련 · 수기 교육", active: false, href: "#", color: "bg-orange-500/20" },
  { icon: "🧠", name: "Orchestrator", desc: "AI 오케스트레이터", active: true, href: "#chat", color: "bg-cyan-500/20" },
] as const

interface AgentGridProps {
  onChatClick?: () => void
}

export function AgentGrid({ onChatClick }: AgentGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {AGENTS.map((agent) => {
        const isOrchestrator = agent.name === "Orchestrator"
        const inner = (
          <div
            className={`border border-zinc-700 rounded-xl p-4 bg-zinc-900 transition-colors ${
              agent.active
                ? "hover:bg-zinc-800 hover:border-zinc-600 cursor-pointer"
                : "opacity-50 cursor-not-allowed"
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`w-12 h-12 rounded-full ${agent.color} flex items-center justify-center text-2xl`}>
                {agent.icon}
              </div>
              {!agent.active && (
                <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-600">
                  준비중
                </Badge>
              )}
              {agent.active && !isOrchestrator && (
                <span className="w-2 h-2 rounded-full bg-green-500 mt-1" />
              )}
            </div>
            <p className="text-white text-sm font-semibold">{agent.name}</p>
            <p className="text-zinc-500 text-xs mt-0.5">{agent.desc}</p>
          </div>
        )

        if (isOrchestrator) {
          return (
            <button type="button" key={agent.name} onClick={onChatClick} className="text-left">
              {inner}
            </button>
          )
        }

        if (agent.active) {
          return (
            <Link key={agent.name} href={agent.href}>
              {inner}
            </Link>
          )
        }

        return <div key={agent.name}>{inner}</div>
      })}
    </div>
  )
}
