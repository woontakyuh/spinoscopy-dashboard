"use client"

import { useState, useEffect, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts"
import { loadUserProfile } from "@/lib/sensei/userProfile"
import { ARCHETYPES } from "@/lib/sensei/archetypes"
import { BELT_CAPS, PROMOTION_HISTORY } from "@/lib/sensei/stats"
import type { BjjStats, BjjAttributes, UserProfile } from "@/lib/types/sensei"

interface SenseiDashboardProps {
  onNavigate: (tab: string) => void
}

const STAT_BARS: { key: keyof BjjAttributes; name: string; color: string; hex: string }[] = [
  { key: "guard", name: "Guard", color: "bg-purple-500", hex: "#a855f7" },
  { key: "passing", name: "Passing", color: "bg-green-500", hex: "#22c55e" },
  { key: "control", name: "Control", color: "bg-orange-600", hex: "#f97316" },
  { key: "finishing", name: "Finishing", color: "bg-red-500", hex: "#ef4444" },
  { key: "takedowns", name: "Takedowns", color: "bg-cyan-500", hex: "#06b6d4" },
  { key: "legLocks", name: "Leg Locks", color: "bg-yellow-500", hex: "#eab308" },
]

const BELTS = [
  { id: "white", color: "bg-zinc-200", hex: "#d4d4d8" },
  { id: "blue", color: "bg-blue-600", hex: "#3b82f6" },
  { id: "purple", color: "bg-purple-600", hex: "#a855f7" },
  { id: "brown", color: "bg-amber-800", hex: "#92400e" },
  { id: "black", color: "bg-zinc-900", hex: "#27272a" },
]

function getClipPath(index: number, length: number) {
  if (index === 0) return "polygon(0% 0%, calc(100% - 1.5rem) 0%, 100% 50%, calc(100% - 1.5rem) 100%, 0% 100%)"
  if (index === length - 1) return "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 1.5rem 50%)"
  return "polygon(0% 0%, calc(100% - 1.5rem) 0%, 100% 50%, calc(100% - 1.5rem) 100%, 0% 100%, 1.5rem 50%)"
}

// 특정 벨트의 승급 히스토리에서 도달한 그랄 수
function getStripesForBelt(belt: string): { reached: number; dates: string[] } {
  const entries = PROMOTION_HISTORY.filter((p) => p.belt === belt)
  const maxStripes = entries.length > 0 ? Math.max(...entries.map((e) => e.stripes)) : 0
  return { reached: maxStripes, dates: entries.map((e) => e.date) }
}

export function SenseiDashboard({ onNavigate }: SenseiDashboardProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [hoveredBelt, setHoveredBelt] = useState<{ belt: string; stripe: number } | null>(null)
  const [coachQ, setCoachQ] = useState("")
  const [coachExpanded, setCoachExpanded] = useState(false)
  const [coachMessages, setCoachMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([])
  const [coachLoading, setCoachLoading] = useState(false)
  const [giMode, setGiMode] = useState<"gi" | "nogi">("gi")
  const [imgError, setImgError] = useState(false)

  useEffect(() => { setProfile(loadUserProfile()) }, [])

  const { data, isLoading, error } = useQuery<{ stats: BjjStats; tagFrequencies: Record<string, number> }>({
    queryKey: ["sensei-stats"],
    queryFn: async () => { const r = await fetch("/api/notion/sensei/stats"); if (!r.ok) throw new Error("err"); return r.json() },
  })

  const { data: coachData } = useQuery<{ reply: string }>({
    queryKey: ["sensei-coach-oneliner", data?.stats?.level],
    queryFn: async () => {
      const r = await fetch("/api/ai/sensei-coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "oneliner", stats: data?.stats }) })
      if (!r.ok) throw new Error("err"); return r.json()
    },
    enabled: !!data?.stats, staleTime: 1000 * 60 * 30,
  })

  async function sendCoachMessage(text: string) {
    if (coachLoading) return
    setCoachMessages((prev) => [...prev, { role: "user", content: text }])
    setCoachQ(""); setCoachLoading(true); setCoachExpanded(true)
    try {
      const r = await fetch("/api/ai/sensei-coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, history: coachMessages, stats: data?.stats }) })
      if (r.ok) { const d = await r.json(); setCoachMessages((prev) => [...prev, { role: "assistant", content: d.reply }]) }
    } catch { /* ignore */ }
    setCoachLoading(false)
  }

  const arch = useMemo(() => {
    if (!data?.stats?.combined.closestArchetype) return null
    return ARCHETYPES.find((a) => a.name === data.stats.combined.closestArchetype) ?? null
  }, [data])

  if (isLoading || !profile) return <div className="flex justify-center py-20"><span className="text-sm text-zinc-500 animate-pulse">스탯 불러오는 중...</span></div>
  if (error || !data) return <div className="text-center py-20"><p className="text-sm text-red-400">스탯을 불러올 수 없습니다</p></div>

  const { stats, tagFrequencies } = data
  const activeStats = stats[giMode]
  const attrs = activeStats.attributes
  const beltCap = BELT_CAPS[stats.belt] ?? 40

  // Radar data: 100점 기준 + 벨트 한계 점선
  const radarData = [
    { subject: "Guard", value: attrs.guard, cap: beltCap },
    { subject: "Passing", value: attrs.passing, cap: beltCap },
    { subject: "Control", value: attrs.control, cap: beltCap },
    { subject: "Finishing", value: attrs.finishing, cap: beltCap },
    { subject: "Takedowns", value: attrs.takedowns, cap: beltCap },
    { subject: "Leg Locks", value: attrs.legLocks, cap: beltCap },
  ]

  // Tooltip for belt stripe
  function getPromotionDate(belt: string, stripe: number): string | null {
    const entry = PROMOTION_HISTORY.find((p) => p.belt === belt && p.stripes === stripe)
    return entry?.date ?? null
  }

  const currentBeltIdx = BELTS.findIndex((b) => b.id === stats.belt)

  return (
    <div className="min-h-0 text-zinc-100 font-sans">
      <div className="max-w-5xl mx-auto">
        {/* ═══ 2컬럼: 캐릭터 + 스탯 ═══ */}
        <div className="bg-[#121212] border border-zinc-800 rounded-2xl overflow-hidden grid grid-cols-1 md:grid-cols-[280px_1fr]">
          {/* 좌측: 전신 캐릭터 */}
          <div className="hidden md:flex flex-col items-center justify-end bg-[#0e0e0e] max-h-[500px] overflow-hidden">
            {!imgError ? (
              <img src="/images/character_full.png" alt="Character" className="w-full max-w-[280px] h-full object-contain object-bottom" onError={() => setImgError(true)} />
            ) : (
              <svg viewBox="0 0 120 160" className="w-32 h-auto mb-4">
                <circle cx="60" cy="30" r="20" fill="#52525b" />
                <path d="M32 58 Q32 48 42 46 L60 52 L78 46 Q88 48 88 58 L88 118 L32 118 Z" fill="#d4d4d8" stroke="#a1a1aa" strokeWidth="0.5" />
                <rect x="32" y="86" width="56" height="7" rx="1" fill={BELTS.find((b) => b.id === stats.belt)?.hex || "#3b82f6"} />
                <path d="M32 118 L36 152 L54 152 L60 122 L66 152 L84 152 L88 118 Z" fill="#3f3f46" />
              </svg>
            )}
          </div>
          {/* 우측: 스탯 패널 */}
          <div className="p-5 space-y-4">

        {/* 프로필 헤더 */}
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="text-xl font-semibold text-white">{profile.name}</h1>
            <span className="text-sm text-zinc-500">{stats.playstyle}</span>
            {/* Gi/NoGi 토글 */}
            <div className="flex gap-1 ml-auto">
              <button onClick={() => setGiMode("gi")} className={`px-2.5 py-0.5 rounded text-xs transition-colors ${giMode === "gi" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "text-zinc-500 border border-transparent"}`}>Gi</button>
              <button onClick={() => setGiMode("nogi")} className={`px-2.5 py-0.5 rounded text-xs transition-colors ${giMode === "nogi" ? "bg-red-500/20 text-red-400 border border-red-500/30" : "text-zinc-500 border border-transparent"}`}>NoGi</button>
            </div>
          </div>

          {/* 수련 요약 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center sm:text-left">
            <div>
              <p className="text-base font-semibold text-zinc-100">2019.11</p>
              <p className="text-xs text-zinc-500">수련 시작</p>
            </div>
            <div>
              <p className="text-base font-semibold text-zinc-100">
                {giMode === "gi" ? stats.sessions2026Gi : stats.sessions2026Nogi}
              </p>
              <p className="text-xs text-zinc-500">2026 {giMode === "gi" ? "Gi" : "NoGi"} 수련</p>
            </div>
            <div>
              <p className="text-base font-semibold text-zinc-100">{Math.round(stats.giRatio * 100)}%</p>
              <p className="text-xs text-zinc-500">Gi 비율</p>
            </div>
            <div>
              <p className={`text-base font-semibold ${stats.attendanceRate >= 60 ? "text-green-400" : stats.attendanceRate >= 30 ? "text-yellow-400" : "text-red-400"}`}>
                {stats.attendanceRate}%
              </p>
              <p className="text-xs text-zinc-500">출석률 (승급 이후)</p>
            </div>
          </div>
        </div>

          {/* ═══ 벨트 쉐브론 타임라인 ═══ */}
          <div className="flex items-center mt-8 h-14 relative w-full gap-0.5">
            {BELTS.map((belt, idx) => {
              const isPast = currentBeltIdx >= idx
              const isCurrent = belt.id === stats.belt
              const beltPromo = getStripesForBelt(belt.id)
              const stripesFilled = isPast ? (isCurrent ? stats.beltStripes : beltPromo.reached) : 0
              // 5등분: [승급] [1그랄] [2그랄] [3그랄] [4그랄]
              const slots = [0, 1, 2, 3, 4]

              return (
                <div
                  key={belt.id}
                  className={`relative h-full flex-1 ${belt.color} ${!isPast ? "opacity-30 grayscale" : ""}`}
                  style={{ clipPath: getClipPath(idx, BELTS.length) }}
                >
                  {/* 균등 분포 그랄 마커 */}
                  <div className="absolute inset-0 flex items-center">
                    {slots.map((si) => {
                      const filled = isPast && si <= stripesFilled
                      const isSlotBeltStart = si === 0
                      return (
                        <div
                          key={si}
                          className="flex-1 flex items-center justify-center h-full"
                          style={{ minWidth: 20, cursor: isPast ? "pointer" : "default" }}
                          onMouseEnter={() => isPast && setHoveredBelt({ belt: belt.id, stripe: si })}
                          onMouseLeave={() => setHoveredBelt(null)}
                        >
                          {isSlotBeltStart ? (
                            <div className={`w-2 h-2 rounded-full ${filled ? "bg-white" : "bg-zinc-700"}`} />
                          ) : (
                            <div className={`w-1.5 h-[60%] rounded-sm ${filled ? "bg-white" : "bg-zinc-800/60"}`} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Hover tooltip */}
            {hoveredBelt && (() => {
              const isStart = hoveredBelt.stripe === 0
              const promoDate = isStart
                ? getPromotionDate(hoveredBelt.belt, 0) || PROMOTION_HISTORY.find((p) => p.belt === hoveredBelt.belt)?.date
                : getPromotionDate(hoveredBelt.belt, hoveredBelt.stripe)
              const beltIdx = BELTS.findIndex((b) => b.id === hoveredBelt.belt)
              const slotPct = (beltIdx + (hoveredBelt.stripe + 0.5) / 5) / BELTS.length * 100
              const label = isStart ? `${hoveredBelt.belt} 승급` : `${hoveredBelt.belt} ${hoveredBelt.stripe}그랄`
              return (
                <div
                  className="absolute top-[-52px] bg-zinc-800 text-xs px-3 py-2 rounded-lg border border-zinc-700 z-20 pointer-events-none whitespace-nowrap"
                  style={{ left: `${slotPct}%`, transform: "translateX(-50%)" }}
                >
                  <p className="text-zinc-200">{label}</p>
                  {promoDate && <p className="text-zinc-400">{promoDate}</p>}
                  <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-zinc-800 rotate-45 border-r border-b border-zinc-700" />
                </div>
              )
            })()}
          </div>
        </div>

        {/* ═══ 하단 2단 그리드 ═══ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

          {/* 좌측: 레이더 차트 */}
          <div
            className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 flex flex-col items-center cursor-pointer hover:border-zinc-700 transition-colors"
            onClick={() => onNavigate("skilltree")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") onNavigate("skilltree") }}
          >
            <h3 className="text-sm font-medium text-zinc-400 w-full mb-4">능력치 레이더</h3>
            <div className="w-full h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                  <PolarGrid stroke="#27272a" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                  {/* 벨트 한계 점선 */}
                  <Radar name="Belt Cap" dataKey="cap" stroke={BELTS.find((b) => b.id === stats.belt)?.hex || "#3b82f6"} strokeWidth={1} strokeDasharray="4 3" fill="none" fillOpacity={0} />
                  {/* 실제 스탯 */}
                  <Radar name="Stats" dataKey="value" stroke="#f97316" strokeWidth={2} fill="#f97316" fillOpacity={0.2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            {arch && (
              <p className="text-xs text-zinc-500 mt-2">
                아키타입: {arch.flag} <span className="text-zinc-300 font-medium">{arch.name}</span> — {arch.playstyle}
              </p>
            )}
          </div>

          {/* 우측: 6축 바 + 최근 포커스 */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-zinc-400">6축 능력치</h3>
                <span className="text-xs text-zinc-500">OVR <span className="text-lg font-semibold text-white">{activeStats.ovr}</span></span>
              </div>
              <div className="space-y-2">
                {STAT_BARS.map((stat) => (
                  <div key={stat.name} className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">{stat.name}</span>
                      <span className="font-semibold text-zinc-200">{attrs[stat.key]}</span>
                    </div>
                    <div className="relative w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className={`h-full ${stat.color} rounded-full transition-all duration-500`} style={{ width: `${attrs[stat.key]}%` }} />
                      {/* 벨트 한계 마커 */}
                      <div className="absolute top-0 h-full w-px" style={{ left: `${beltCap}%`, background: BELTS.find((b) => b.id === stats.belt)?.hex || "#3b82f6", opacity: 0.5 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 최근 포커스 */}
            <div className="mt-4 pt-3 border-t border-zinc-800">
              <h3 className="text-sm font-medium text-zinc-400 mb-3">최근 포커스</h3>
              <div className="flex flex-wrap gap-2">
                {stats.recentFocus.length > 0 ? stats.recentFocus.map((tag) => (
                  <span key={tag} className="px-2.5 py-1 bg-orange-900/20 text-orange-500 border border-orange-900/50 rounded text-xs font-medium">
                    {tag}{tagFrequencies[tag] ? <span className="ml-1 text-orange-700">{tagFrequencies[tag]}</span> : null}
                  </span>
                )) : <span className="text-xs text-zinc-600">수련 기록이 쌓이면 표시됩니다</span>}
              </div>
            </div>

          </div>
        </div>
          </div>{/* 우측 패널 닫기 */}
        </div>{/* 2컬럼 grid 닫기 */}

        {/* ═══ Coach 임베드 (full width) ═══ */}
        <div className="mt-4 bg-[#121212] border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-3">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setCoachExpanded(!coachExpanded)} className="text-base shrink-0">🤖</button>
              <p className="flex-1 text-sm text-zinc-400 leading-relaxed">{coachData?.reply || "코치 추천 로딩 중..."}</p>
              <button type="button" onClick={() => setCoachExpanded(!coachExpanded)} className="text-xs text-zinc-600 hover:text-zinc-400 shrink-0">
                {coachExpanded ? "접기 ▲" : "채팅 ▼"}
              </button>
            </div>
            <div className="flex gap-2 mt-2">
              <input type="text" value={coachQ} onChange={(e) => setCoachQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && coachQ.trim()) sendCoachMessage(coachQ.trim()) }}
                placeholder="코치에게 질문..."
                className="flex-1 px-3 py-1.5 rounded-lg text-xs text-white bg-zinc-800 border border-zinc-700 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600" />
              <button type="button" onClick={() => { if (coachQ.trim()) sendCoachMessage(coachQ.trim()) }}
                disabled={!coachQ.trim() || coachLoading}
                className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 bg-zinc-800 border border-zinc-700 hover:text-zinc-200 hover:border-zinc-600 transition-colors disabled:opacity-30">
                질문
              </button>
            </div>
          </div>
          {coachExpanded && (
            <div className="border-t border-zinc-800 max-h-[300px] overflow-y-auto px-5 py-3 space-y-2">
              {coachMessages.length === 0 && !coachLoading && <p className="text-xs text-zinc-600 text-center py-3">질문을 입력하면 AI 코치가 답변합니다</p>}
              {coachMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs whitespace-pre-wrap ${msg.role === "user" ? "bg-blue-500/10 text-blue-100 rounded-br-md" : "bg-zinc-800 text-zinc-200 rounded-bl-md"}`}>{msg.content}</div>
                </div>
              ))}
              {coachLoading && <div className="flex justify-start"><div className="bg-zinc-800 rounded-2xl rounded-bl-md px-3 py-2 text-xs text-zinc-400 animate-pulse">답변 생성 중...</div></div>}
            </div>
          )}
        </div>

        {/* 하단 네비 */}
        <div className="flex gap-2 flex-wrap mt-4 pt-3 border-t border-zinc-800">
          {[{ t: "skilltree", l: "Skill Tree", i: "🌳" }, { t: "journal", l: "수련 기록", i: "📝" }, { t: "strategy", l: "전략", i: "🎯" }, { t: "competition", l: "대회", i: "📅" }].map(({ t, l, i }) => (
            <button key={t} type="button" onClick={() => onNavigate(t)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 hover:text-zinc-300 hover:border-zinc-700 transition-colors">
              <span>{i}</span><span>{l}</span>
            </button>
          ))}
        </div>

    </div>
  )
}
