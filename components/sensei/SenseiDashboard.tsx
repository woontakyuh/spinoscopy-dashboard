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

interface SenseiDashboardProps { onNavigate: (tab: string) => void }

const STAT_BARS: { key: keyof BjjAttributes; name: string; color: string }[] = [
  { key: "guard", name: "Guard", color: "bg-purple-500" },
  { key: "passing", name: "Passing", color: "bg-green-500" },
  { key: "control", name: "Control", color: "bg-orange-600" },
  { key: "finishing", name: "Finishing", color: "bg-red-500" },
  { key: "takedowns", name: "Takedowns", color: "bg-cyan-500" },
  { key: "legLocks", name: "Leg Locks", color: "bg-yellow-500" },
]

const BELTS = [
  { id: "white", color: "bg-zinc-200", hex: "#d4d4d8" },
  { id: "blue", color: "bg-blue-600", hex: "#3b82f6" },
  { id: "purple", color: "bg-purple-600", hex: "#a855f7" },
  { id: "brown", color: "bg-amber-800", hex: "#92400e" },
  { id: "black", color: "bg-zinc-900", hex: "#27272a" },
]

function getClipPath(i: number, len: number) {
  if (i === 0) return "polygon(0% 0%, calc(100% - 1.5rem) 0%, 100% 50%, calc(100% - 1.5rem) 100%, 0% 100%)"
  if (i === len - 1) return "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 1.5rem 50%)"
  return "polygon(0% 0%, calc(100% - 1.5rem) 0%, 100% 50%, calc(100% - 1.5rem) 100%, 0% 100%, 1.5rem 50%)"
}

function getStripesForBelt(belt: string) {
  const entries = PROMOTION_HISTORY.filter((p) => p.belt === belt)
  return { reached: entries.length > 0 ? Math.max(...entries.map((e) => e.stripes)) : 0 }
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

  const { data, isLoading, error } = useQuery<{ stats: BjjStats; tagFrequencies: Record<string, number>; studyTagFrequencies: Record<string, number> }>({
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
  const beltHex = BELTS.find((b) => b.id === stats.belt)?.hex || "#3b82f6"
  const currentBeltIdx = BELTS.findIndex((b) => b.id === stats.belt)
  const radarData = [
    { subject: "Guard", value: attrs.guard, cap: beltCap },
    { subject: "Passing", value: attrs.passing, cap: beltCap },
    { subject: "Control", value: attrs.control, cap: beltCap },
    { subject: "Finishing", value: attrs.finishing, cap: beltCap },
    { subject: "Takedowns", value: attrs.takedowns, cap: beltCap },
    { subject: "Leg Locks", value: attrs.legLocks, cap: beltCap },
  ]

  function getPromoDate(belt: string, stripe: number): string | undefined {
    return PROMOTION_HISTORY.find((p) => p.belt === belt && p.stripes === stripe)?.date
  }

  return (
    <div className="text-zinc-100 font-sans">
      <div className="max-w-5xl mx-auto space-y-4">

        {/* ══ 메인 카드: 이미지 | 스탯 ══ */}
        <div className="bg-[#121212] border border-zinc-800 rounded-2xl overflow-hidden grid grid-cols-1 md:grid-cols-[240px_1fr]">

          {/* 좌: 이미지 */}
          <div className="hidden md:flex bg-[#0e0e0e] items-end justify-center">
            {!imgError ? (
              <img src="/images/character_full.png" alt="" className="w-full max-w-[240px] max-h-[520px] object-contain object-bottom" onError={() => setImgError(true)} />
            ) : (
              <svg viewBox="0 0 120 160" className="w-28 mb-4"><circle cx="60" cy="30" r="20" fill="#52525b"/><path d="M32 58 Q32 48 42 46 L60 52 L78 46 Q88 48 88 58 L88 118 L32 118 Z" fill="#d4d4d8"/><rect x="32" y="86" width="56" height="7" rx="1" fill={beltHex}/><path d="M32 118 L36 152 L54 152 L60 122 L66 152 L84 152 L88 118 Z" fill="#3f3f46"/></svg>
            )}
          </div>

          {/* 우: 스탯 패널 (독립 스크롤) */}
          <div className="p-5 flex flex-col gap-4 overflow-y-auto" style={{ maxHeight: 600 }}>

            {/* 이름 + Gi/NoGi */}
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-semibold text-white">{profile.name}</h1>
              <span className="text-sm text-zinc-500">{stats.playstyle}</span>
              <div className="flex gap-1 ml-auto">
                <button onClick={() => setGiMode("gi")} className={`px-2.5 py-0.5 rounded text-xs ${giMode === "gi" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "text-zinc-500 border border-transparent"}`}>Gi</button>
                <button onClick={() => setGiMode("nogi")} className={`px-2.5 py-0.5 rounded text-xs ${giMode === "nogi" ? "bg-red-500/20 text-red-400 border border-red-500/30" : "text-zinc-500 border border-transparent"}`}>NoGi</button>
              </div>
            </div>

            {/* 수련 요약 */}
            <div className="grid grid-cols-4 gap-3 text-center">
              <div><p className="text-sm font-semibold">2019.11</p><p className="text-[10px] text-zinc-500">수련 시작</p></div>
              <div><p className="text-sm font-semibold">{giMode === "gi" ? stats.sessions2026Gi : stats.sessions2026Nogi}</p><p className="text-[10px] text-zinc-500">2026 {giMode === "gi" ? "Gi" : "NoGi"}</p></div>
              <div><p className="text-sm font-semibold">{Math.round(stats.giRatio * 100)}%</p><p className="text-[10px] text-zinc-500">Gi 비율</p></div>
              <div><p className={`text-sm font-semibold ${stats.attendanceRate >= 60 ? "text-green-400" : stats.attendanceRate >= 30 ? "text-yellow-400" : "text-red-400"}`}>{stats.attendanceRate}%</p><p className="text-[10px] text-zinc-500">출석률</p></div>
            </div>

            {/* 벨트 타임라인 */}
            <div className="flex items-center h-11 relative w-full gap-0.5">
              {BELTS.map((belt, idx) => {
                const isPast = currentBeltIdx >= idx
                const isCur = belt.id === stats.belt
                const filled = isPast ? (isCur ? stats.beltStripes : getStripesForBelt(belt.id).reached) : 0
                return (
                  <div key={belt.id} className={`relative h-full flex-1 ${belt.color} ${!isPast ? "opacity-30 grayscale" : ""}`} style={{ clipPath: getClipPath(idx, BELTS.length) }}>
                    <div className="absolute inset-0 flex items-center">
                      {[0,1,2,3,4].map((si) => (
                        <div key={si} className="flex-1 flex items-center justify-center h-full" style={{ minWidth: 14 }}
                          onMouseEnter={() => isPast && setHoveredBelt({ belt: belt.id, stripe: si })}
                          onMouseLeave={() => setHoveredBelt(null)}>
                          {si === 0
                            ? <div className={`w-1.5 h-1.5 rounded-full ${isPast && si <= filled ? "bg-white" : "bg-zinc-700"}`}/>
                            : <div className={`w-1 h-[50%] rounded-sm ${isPast && si <= filled ? "bg-white" : "bg-zinc-800/50"}`}/>}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
              {hoveredBelt && (() => {
                const d = hoveredBelt.stripe === 0
                  ? getPromoDate(hoveredBelt.belt, 0) || PROMOTION_HISTORY.find((p) => p.belt === hoveredBelt.belt)?.date
                  : getPromoDate(hoveredBelt.belt, hoveredBelt.stripe)
                const bi = BELTS.findIndex((b) => b.id === hoveredBelt.belt)
                const pct = (bi + (hoveredBelt.stripe + 0.5) / 5) / BELTS.length * 100
                return (
                  <div className="absolute top-[-40px] bg-zinc-800 text-[10px] px-2 py-1 rounded border border-zinc-700 z-20 pointer-events-none whitespace-nowrap" style={{ left: `${pct}%`, transform: "translateX(-50%)" }}>
                    {hoveredBelt.stripe === 0 ? `${hoveredBelt.belt} 승급` : `${hoveredBelt.belt} ${hoveredBelt.stripe}그랄`}
                    {d && <span className="ml-1 text-zinc-500">{d}</span>}
                  </div>
                )
              })()}
            </div>

            {/* 레이더 + 6축바 나란히 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* 레이더 */}
              <div className="cursor-pointer" onClick={() => onNavigate("skilltree")}>
                <h3 className="text-[10px] font-medium text-zinc-500 mb-1">능력치 레이더</h3>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="68%" data={radarData}>
                      <PolarGrid stroke="#27272a" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: "#a1a1aa", fontSize: 10 }} />
                      <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar name="Cap" dataKey="cap" stroke={beltHex} strokeWidth={1} strokeDasharray="4 3" fill="none" fillOpacity={0} />
                      <Radar name="Stats" dataKey="value" stroke="#f97316" strokeWidth={2} fill="#f97316" fillOpacity={0.2} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                {arch && <p className="text-[10px] text-zinc-500 text-center">{arch.flag} {arch.name}</p>}
              </div>

              {/* 6축 바 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[10px] font-medium text-zinc-500">능력치</h3>
                  <span className="text-xs text-zinc-500">OVR <span className="text-base font-semibold text-white">{activeStats.ovr}</span></span>
                </div>
                <div className="space-y-1.5">
                  {STAT_BARS.map((s) => (
                    <div key={s.name}>
                      <div className="flex justify-between text-[10px] mb-0.5">
                        <span className="text-zinc-400">{s.name}</span>
                        <span className="font-semibold text-zinc-200">{attrs[s.key]}</span>
                      </div>
                      <div className="relative w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                        <div className={`h-full ${s.color} rounded-full`} style={{ width: `${attrs[s.key]}%` }} />
                        <div className="absolute top-0 h-full w-px" style={{ left: `${beltCap}%`, background: beltHex, opacity: 0.4 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 최근 포커스 */}
            <div className="pt-2 border-t border-zinc-800">
              <h3 className="text-[10px] font-medium text-zinc-500 mb-1.5">최근 포커스</h3>
              <div className="flex flex-wrap gap-1.5">
                {stats.recentFocus.length > 0 ? stats.recentFocus.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 bg-orange-900/20 text-orange-500 border border-orange-900/50 rounded text-[10px] font-medium">
                    {tag}{tagFrequencies[tag] ? <span className="ml-1 text-orange-700">{tagFrequencies[tag]}</span> : null}
                  </span>
                )) : <span className="text-[10px] text-zinc-600">수련 기록이 쌓이면 표시됩니다</span>}
              </div>
            </div>

            {/* 요즘 관심사 (Study Tags) */}
            {data.studyTagFrequencies && Object.keys(data.studyTagFrequencies).length > 0 && (
              <div className="pt-2 border-t border-zinc-800">
                <h3 className="text-[10px] font-medium text-zinc-500 mb-1.5">🎥 요즘 관심사 (최근 2주 Study)</h3>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(data.studyTagFrequencies).sort(([, a], [, b]) => b - a).slice(0, 8).map(([tag, count]) => (
                    <span key={tag} className="px-2 py-0.5 bg-green-900/20 text-green-500 border border-green-900/50 rounded text-[10px] font-medium">
                      {tag}<span className="ml-1 text-green-700">{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 학습 사이클 */}
            {(stats.completedCycles.length > 0 || stats.inProgressCycles.length > 0) && (
              <div className="pt-2 border-t border-zinc-800">
                <h3 className="text-[10px] font-medium text-zinc-500 mb-1.5">학습 사이클 (최근 30일)</h3>
                <div className="flex flex-wrap gap-1.5">
                  {stats.completedCycles.map((c) => (
                    <span key={`cycle-${c.tag}`} className="px-2 py-0.5 bg-emerald-900/20 text-emerald-400 border border-emerald-900/50 rounded text-[10px] font-medium">
                      🔄 {c.tag}
                    </span>
                  ))}
                  {stats.inProgressCycles.map((c) => (
                    <span key={`prog-${c.tag}`} className="px-2 py-0.5 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded text-[10px] font-medium">
                      {c.tag}
                      <span className="ml-1 text-[9px]">{c.study ? "📹" : ""}{c.class ? "📖" : ""}{c.sparring ? "🥊" : ""}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* ══ Coach ══ */}
        <div className="bg-[#121212] border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-3">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setCoachExpanded(!coachExpanded)} className="text-base shrink-0">🤖</button>
              <p className="flex-1 text-sm text-zinc-400">{coachData?.reply || "코치 추천 로딩 중..."}</p>
              <button type="button" onClick={() => setCoachExpanded(!coachExpanded)} className="text-xs text-zinc-600 hover:text-zinc-400 shrink-0">{coachExpanded ? "접기 ▲" : "채팅 ▼"}</button>
            </div>
            <div className="flex gap-2 mt-2">
              <input type="text" value={coachQ} onChange={(e) => setCoachQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && coachQ.trim()) sendCoachMessage(coachQ.trim()) }} placeholder="코치에게 질문..." className="flex-1 px-3 py-1.5 rounded-lg text-xs text-white bg-zinc-800 border border-zinc-700 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600" />
              <button type="button" onClick={() => { if (coachQ.trim()) sendCoachMessage(coachQ.trim()) }} disabled={!coachQ.trim() || coachLoading} className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 bg-zinc-800 border border-zinc-700 hover:text-zinc-200 transition-colors disabled:opacity-30">질문</button>
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

        {/* ══ 네비 ══ */}
        <div className="flex gap-2 flex-wrap pt-2 border-t border-zinc-800">
          {[{ t: "skilltree", l: "Skill Tree", i: "🌳" }, { t: "journal", l: "수련 기록", i: "📝" }, { t: "strategy", l: "전략", i: "🎯" }, { t: "competition", l: "대회", i: "📅" }].map(({ t, l, i }) => (
            <button key={t} type="button" onClick={() => onNavigate(t)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 hover:text-zinc-300 hover:border-zinc-700 transition-colors">
              <span>{i}</span><span>{l}</span>
            </button>
          ))}
        </div>

      </div>
    </div>
  )
}
