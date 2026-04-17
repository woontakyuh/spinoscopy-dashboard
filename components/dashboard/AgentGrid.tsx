"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"

const AGENTS = [
  { icon: "🩺", image: "/elon.png", name: "Elon", desc: "환자 · 수술 DB", active: true, href: "/agents/elon", accent: "border-emerald-500/30" },
  { icon: "🔬", image: "/brian.png", name: "Brian", desc: "논문 탐색 · 연구 분석", active: true, href: "/agents/brian", accent: "border-blue-500/30" },
  { icon: "💰", image: "/warren.png", name: "Warren", desc: "재무 · 정산 관리", active: true, href: "/agents/warren", accent: "border-amber-500/30" },
  { icon: "🥋", image: "/lo.png", name: "Lo", desc: "수련 · 수기 교육", active: true, href: "/agents/lo", accent: "border-orange-500/30" },
  { icon: "🛰️", image: "/andrej.png", name: "Andrej", desc: "AI 뉴스 · 피드", active: true, href: "/agents/andrej", accent: "border-cyan-500/30" },
] as const

export function AgentGrid() {
  return (
    <div className="grid grid-cols-5 gap-2 md:gap-3">
      {AGENTS.map((agent) => {
        const card = (
          <div
            className={`relative border rounded-xl p-1.5 md:p-3 bg-card transition-all ${
              agent.active
                ? `${agent.accent} hover:scale-[1.03] hover:shadow-lg cursor-pointer`
                : "border-border opacity-40 cursor-not-allowed"
            }`}
          >
            <div className="flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 md:w-16 md:h-16 rounded-full bg-muted flex items-center justify-center text-3xl overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={agent.image} alt={agent.name} className="w-full h-full object-cover" />
              </div>
              <div>
                <p className="text-foreground text-[10px] md:text-xs font-semibold">{agent.name}</p>
                <p className="hidden md:block text-muted-foreground text-[10px] mt-0.5 leading-tight">{agent.desc}</p>
              </div>
              {agent.active && (
                <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-green-500" />
              )}
              {!agent.active && (
                <Badge variant="outline" className="text-[9px] border-border text-muted-foreground/70 px-1.5 py-0">
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
