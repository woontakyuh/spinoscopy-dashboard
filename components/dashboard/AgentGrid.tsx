"use client"

import Link from "next/link"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"

const AGENTS = [
  { id: "elon",   icon: "🩺", image: "/elon.png", name: "Elon", desc: "환자 · 수술 DB", active: true, href: "/agents/elon", accent: "border-emerald-500/30" },
  { id: "brian",  icon: "🔬", image: "/brian.png", name: "Brian", desc: "논문 탐색 · 연구 분석", active: true, href: "/agents/brian", accent: "border-blue-500/30" },
  { id: "warren", icon: "💰", image: "/warren.png", name: "Warren", desc: "재무 · 정산 관리", active: true, href: "/agents/warren", accent: "border-amber-500/30" },
  { id: "lo",     icon: "🥋", image: "/lo.png", name: "Lo", desc: "수련 · 수기 교육", active: true, href: "/agents/lo", accent: "border-orange-500/30" },
  { id: "andrej", icon: "🛰️", image: "/andrej.png", name: "Andrej", desc: "AI 뉴스 · 피드", active: true, href: "/agents/andrej", accent: "border-cyan-500/30" },
] as const

type AgentId = (typeof AGENTS)[number]["id"]

export function AgentGrid() {
  const [hoveredId, setHoveredId] = useState<AgentId | null>(null)

  const { data: greetings } = useQuery<Record<AgentId, string>>({
    queryKey: ["dashboard-greetings"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/greetings")
      if (!res.ok) throw new Error("greetings 조회 실패")
      return res.json()
    },
    staleTime: 60 * 1000,  // 1 min — 호버 시 신선도 중요
    refetchOnWindowFocus: true,
  })

  return (
    <div className="grid grid-cols-5 gap-2 md:gap-3">
      {AGENTS.map((agent) => {
        const isHovered = hoveredId === agent.id
        const greeting = greetings?.[agent.id]
        const card = (
          <div
            onMouseEnter={() => setHoveredId(agent.id)}
            onMouseLeave={() => setHoveredId((id) => (id === agent.id ? null : id))}
            className={`relative border rounded-xl p-1.5 md:p-3 bg-card transition-all ${
              agent.active
                ? `${agent.accent} hover:scale-[1.03] hover:shadow-lg cursor-pointer`
                : "border-border opacity-40 cursor-not-allowed"
            }`}
          >
            {/* Speech bubble — agent 위에 떠 있음. relative parent 기준 absolute. */}
            {isHovered && greeting && (
              <div
                className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-20 pointer-events-none animate-fade-in-up"
                style={{ width: "min(420px, 80vw)" }}
              >
                <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-xl text-foreground/95 text-sm leading-snug">
                  {greeting}
                </div>
                {/* 꼬리 — agent 사진 방향으로 */}
                <div className="absolute left-1/2 -translate-x-1/2 top-full -mt-px w-3 h-3 rotate-45 bg-card border-r border-b border-border" />
              </div>
            )}

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
