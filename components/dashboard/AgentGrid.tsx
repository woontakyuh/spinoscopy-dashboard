"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"

const AGENTS = [
  { icon: "🩺", name: "Clinicus", desc: "임상 보조 · 환자 데이터", active: true, href: "/agents/clinicus", accent: "border-red-500/30" },
  { icon: "🔬", name: "Scholar", desc: "논문 탐색 · 연구 분석", active: true, href: "/agents/scholar", accent: "border-blue-500/30" },
  { icon: "🎓", name: "Maestro", desc: "교육 · 강의 관리", active: false, href: "#", accent: "border-purple-500/30" },
  { icon: "📋", name: "Jarvis", desc: "일정 · 업무 관리", active: false, href: "#", accent: "border-green-500/30" },
  { icon: "💰", name: "Vault", desc: "재무 · 정산 관리", active: false, href: "#", accent: "border-amber-500/30" },
  { icon: "🥋", name: "Sensei", desc: "수련 · 수기 교육", active: false, href: "#", accent: "border-orange-500/30" },
] as const

export function AgentGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {AGENTS.map((agent) => {
        const card = (
          <div
            className={`relative border rounded-xl p-3 bg-zinc-900 transition-all ${
              agent.active
                ? `${agent.accent} hover:scale-[1.03] hover:shadow-lg cursor-pointer`
                : "border-zinc-800 opacity-40 cursor-not-allowed"
            }`}
          >
            <div className="flex flex-col items-center text-center gap-2">
              <div className="w-11 h-11 rounded-full bg-zinc-800 flex items-center justify-center text-xl">
                {agent.icon}
              </div>
              <div>
                <p className="text-white text-xs font-semibold">{agent.name}</p>
                <p className="text-zinc-500 text-[10px] mt-0.5 leading-tight">{agent.desc}</p>
              </div>
              {agent.active && (
                <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-green-500" />
              )}
              {!agent.active && (
                <Badge variant="outline" className="text-[9px] border-zinc-700 text-zinc-600 px-1.5 py-0">
                  준비중
                </Badge>
              )}
            </div>
          </div>
        )

        if (agent.active) {
          return <Link key={agent.name} href={agent.href}>{card}</Link>
        }
        return <div key={agent.name}>{card}</div>
      })}
    </div>
  )
}
