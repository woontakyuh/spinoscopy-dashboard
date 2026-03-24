"use client"

import { useState, useEffect, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts"
import { loadUserProfile } from "@/lib/sensei/userProfile"
import { ARCHETYPES } from "@/lib/sensei/archetypes"
import type { BjjStats, BjjAttributes, UserProfile } from "@/lib/types/sensei"

interface SenseiDashboardProps {
  onNavigate: (tab: string) => void
}

const STAT_BARS: { key: keyof BjjAttributes; name: string; color: string }[] = [
  { key: "guard", name: "Guard", color: "bg-purple-500" },
  { key: "passing", name: "Passing", color: "bg-green-500" },
  { key: "control", name: "Control", color: "bg-orange-600" },
  { key: "finishing", name: "Finishing", color: "bg-red-500" },
  { key: "takedowns", name: "Takedowns", color: "bg-cyan-500" },
  { key: "legLocks", name: "Leg Locks", color: "bg-yellow-500" },
]

const BELTS = [
  { id: "white", color: "bg-zinc-200" },
  { id: "blue", color: "bg-blue-600" },
  { id: "purple", color: "bg-purple-600" },
  { id: "brown", color: "bg-amber-800" },
  { id: "black", color: "bg-zinc-900" },
]

function getClipPath(index: number, length: number) {
  if (index === 0)
    return "polygon(0% 0%, calc(100% - 1.5rem) 0%, 100% 50%, calc(100% - 1.5rem) 100%, 0% 100%)"
  if (index === length - 1)
    return "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 1.5rem 50%)"
  return "polygon(0% 0%, calc(100% - 1.5rem) 0%, 100% 50%, calc(100% - 1.5rem) 100%, 0% 100%, 1.5rem 50%)"
}

function fmtDur(m: number): string {
  const y = Math.floor(m / 12)
  const mo = m % 12
  if (y === 0) return `${mo}개월`
  if (mo === 0) return `${y}년`
  return `${y}년 ${mo}개월`
}

export function SenseiDashboard({ onNavigate }: SenseiDashboardProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [hoveredStripes, setHoveredStripes] = useState(false)
  const [coachQ, setCoachQ] = useState("")
  const [coachExpanded, setCoachExpanded] = useState(false)
  const [coachMessages, setCoachMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([])
  const [coachLoading, setCoachLoading] = useState(false)
  const [giMode, setGiMode] = useState<"gi" | "nogi">("gi")

  useEffect(() => { setProfile(loadUserProfile()) }, [])

  const { data, isLoading, error } = useQuery<{ stats: BjjStats; tagFrequencies: Record<string, number> }>({
    queryKey: ["sensei-stats"],
    queryFn: async () => {
      const r = await fetch("/api/notion/sensei/stats")
      if (!r.ok) throw new Error("err")
      return r.json()
    },
  })

  const { data: coachData } = useQuery<{ reply: string }>({
    queryKey: ["sensei-coach-oneliner", data?.stats?.level],
    queryFn: async () => {
      const r = await fetch("/api/ai/sensei-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "oneliner", stats: data?.stats }),
      })
      if (!r.ok) throw new Error("err")
      return r.json()
    },
    enabled: !!data?.stats,
    staleTime: 1000 * 60 * 30,
  })

  async function sendCoachMessage(text: string) {
    if (coachLoading) return
    const userMsg = { role: "user" as const, content: text }
    setCoachMessages((prev) => [...prev, userMsg])
    setCoachQ("")
    setCoachLoading(true)
    setCoachExpanded(true)
    try {
      const r = await fetch("/api/ai/sensei-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: coachMessages, stats: data?.stats }),
      })
      if (r.ok) {
        const d = await r.json()
        setCoachMessages((prev) => [...prev, { role: "assistant", content: d.reply }])
      }
    } catch { /* ignore */ }
    setCoachLoading(false)
  }

  const arch = useMemo(() => {
    if (!data?.stats?.combined.closestArchetype) return null
    return ARCHETYPES.find((a) => a.name === data.stats.combined.closestArchetype) ?? null
  }, [data])

  if (isLoading || !profile) {
    return (
      <div className="flex justify-center py-20">
        <span className="text-sm text-zinc-500 animate-pulse">스탯 불러오는 중...</span>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="text-center py-20">
        <p className="text-sm text-red-400">스탯을 불러올 수 없습니다</p>
      </div>
    )
  }

  const { stats, tagFrequencies } = data
  const activeStats = stats[giMode]
  const attrs = activeStats.attributes

  const radarData = [
    { subject: "Guard", value: attrs.guard, fullMark: 100 },
    { subject: "Passing", value: attrs.passing, fullMark: 100 },
    { subject: "Control", value: attrs.control, fullMark: 100 },
    { subject: "Finishing", value: attrs.finishing, fullMark: 100 },
    { subject: "Takedowns", value: attrs.takedowns, fullMark: 100 },
    { subject: "Leg Locks", value: attrs.legLocks, fullMark: 100 },
  ]

  const trainingTimeStr = fmtDur(stats.trainingMonths)

  return (
    <div className="min-h-0 text-zinc-100 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* ═══ 상단 프로필 & 요약 카드 ═══ */}
        <div className="bg-[#121212] border border-zinc-800 rounded-2xl p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">

            {/* 좌측 레벨 및 기본 정보 */}
            <div className="flex items-center gap-6">
              <div className="w-20 h-[100px] rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700 shrink-0">
                <img
                  src="/images/character_full.png"
                  alt="Character"
                  className="w-full h-full object-cover object-top"
                />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-xl font-semibold">Lv.{stats.level}</h1>
                  <span className="px-2 py-0.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs font-medium uppercase tracking-wider">
                    {stats.belt} {"I".repeat(stats.beltStripes)}
                  </span>
                  <span className="px-2 py-0.5 rounded-full border border-zinc-700 bg-zinc-800 text-zinc-400 text-xs">
                    {activeStats.ovrRole}
                  </span>
                  {/* Gi/NoGi 토글 */}
                  <div className="flex gap-1 ml-2">
                    <button
                      onClick={() => setGiMode("gi")}
                      className={`px-2 py-0.5 rounded text-xs transition-colors ${
                        giMode === "gi" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "text-zinc-500 border border-transparent"
                      }`}
                    >
                      Gi
                    </button>
                    <button
                      onClick={() => setGiMode("nogi")}
                      className={`px-2 py-0.5 rounded text-xs transition-colors ${
                        giMode === "nogi" ? "bg-red-500/20 text-red-400 border border-red-500/30" : "text-zinc-500 border border-transparent"
                      }`}
                    >
                      NoGi
                    </button>
                  </div>
                </div>

                {/* 경험치 바 */}
                <div className="w-full max-w-xs mt-3">
                  <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
                    <span>Lv.{stats.level} &rarr; Lv.{stats.level + 1}</span>
                    <span>{stats.xpCurrent} / {stats.xpToNext} XP</span>
                  </div>
                  <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange-600 rounded-full"
                      style={{ width: `${(stats.xpCurrent / stats.xpToNext) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 우측 수련 기록 요약 */}
            <div className="grid grid-cols-4 gap-6 text-center md:text-left mt-4 md:mt-0">
              <div>
                <p className="text-lg font-semibold text-zinc-100">{trainingTimeStr}</p>
                <p className="text-xs text-zinc-500">수련 기간</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-zinc-100">{stats.totalSessions}</p>
                <p className="text-xs text-zinc-500">기록된 수련</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-orange-500">{stats.streaks.current}주</p>
                <p className="text-xs text-zinc-500">연속 ({stats.streaks.best}주 최장)</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-zinc-100">{Math.round(stats.giRatio * 100)}%</p>
                <p className="text-xs text-zinc-500">Gi 비율</p>
              </div>
            </div>
          </div>

          {/* ═══ 벨트 쉐브론 타임라인 ═══ */}
          <div className="flex items-center mt-10 h-14 relative w-full gap-0.5">
            {BELTS.map((belt, idx) => {
              const isActive = stats.belt.toLowerCase().includes(belt.id)
              const isPast = BELTS.findIndex((b) => b.id === stats.belt) >= idx

              return (
                <div
                  key={belt.id}
                  className={`relative h-full flex-1 ${belt.color} ${
                    !isPast ? "opacity-40 grayscale" : ""
                  }`}
                  style={{ clipPath: getClipPath(idx, BELTS.length) }}
                >
                  {belt.id === stats.belt && isActive && (
                    <div className="absolute right-8 top-0 h-full w-14 bg-zinc-950 flex justify-evenly items-center py-2 px-1">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div
                          key={String(i)}
                          className={`w-1.5 h-full transition-colors duration-200 ${
                            i < stats.beltStripes ? "bg-white" : "bg-zinc-800"
                          }`}
                          onMouseEnter={() => setHoveredStripes(true)}
                          onMouseLeave={() => setHoveredStripes(false)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {hoveredStripes && (
              <div className="absolute top-[-50px] left-[35%] transform -translate-x-1/2 bg-zinc-800 text-xs px-3 py-2 rounded-lg border border-zinc-700 z-10 pointer-events-none">
                <p className="text-zinc-200">현재 등급</p>
                <p className="font-medium text-white">{stats.belt.toUpperCase()} {stats.beltStripes}그랄</p>
                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-zinc-800 rotate-45 border-r border-b border-zinc-700" />
              </div>
            )}
          </div>
        </div>

        {/* ═══ 하단 2단 그리드 ═══ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* 좌측: 능력치 레이더 차트 */}
          <div
            className="bg-[#121212] border border-zinc-800 rounded-2xl p-6 flex flex-col items-center cursor-pointer hover:border-zinc-700 transition-colors"
            onClick={() => onNavigate("stats")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") onNavigate("stats") }}
          >
            <h3 className="text-sm font-medium text-zinc-400 w-full mb-4">능력치 레이더</h3>
            <div className="w-full h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                  <PolarGrid stroke="#27272a" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                  <Radar name="Stats" dataKey="value" stroke="#f97316" strokeWidth={2} fill="#f97316" fillOpacity={0.2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            {arch && (
              <p className="text-xs text-zinc-500 mt-2">
                가장 유사한 아키타입: {arch.flag}{" "}
                <span className="text-zinc-300 font-medium">{arch.name}</span> — {arch.playstyle}
              </p>
            )}
          </div>

          {/* 우측: 6축 능력치 바 & 최근 포커스 & 목표 */}
          <div className="bg-[#121212] border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-medium text-zinc-400">6축 능력치</h3>
                <span className="text-xs text-zinc-500">OVR <span className="text-lg font-semibold text-white">{activeStats.ovr}</span></span>
              </div>
              <div className="space-y-4">
                {STAT_BARS.map((stat) => (
                  <div key={stat.name} className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">{stat.name}</span>
                      <span className="font-semibold text-zinc-200">{attrs[stat.key]}</span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${stat.color} rounded-full transition-all duration-500`}
                        style={{ width: `${attrs[stat.key]}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 최근 포커스 */}
            <div className="mt-8 pt-6 border-t border-zinc-800">
              <h3 className="text-sm font-medium text-zinc-400 mb-3">최근 포커스</h3>
              <div className="flex flex-wrap gap-2">
                {stats.recentFocus.length > 0 ? stats.recentFocus.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 bg-orange-900/20 text-orange-500 border border-orange-900/50 rounded text-xs font-medium"
                  >
                    {tag}
                    {tagFrequencies[tag] ? <span className="ml-1 text-orange-700">{tagFrequencies[tag]}</span> : null}
                  </span>
                )) : (
                  <span className="text-xs text-zinc-600">수련 기록이 쌓이면 표시됩니다</span>
                )}
              </div>
            </div>

            {/* 목표 프로그레스 */}
            {profile?.nextGoalTitle && (
              <div className="mt-4 pt-4 border-t border-zinc-800">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-zinc-400">{profile.nextGoalTitle}</h3>
                  <span className="text-xs font-medium text-zinc-300">{profile.nextGoalProgress ?? 0}%</span>
                </div>
                {profile.nextGoalText && (
                  <p className="text-xs text-zinc-500 mb-2">{profile.nextGoalText}</p>
                )}
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-500"
                    style={{ width: `${profile.nextGoalProgress ?? 0}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══ Coach 임베드 (접힘/펼침) ═══ */}
        <div className="bg-[#121212] border border-zinc-800 rounded-2xl overflow-hidden">
          {/* 접힌 상태: 한줄 추천 + 질문 입력 */}
          <div className="px-6 py-4">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setCoachExpanded(!coachExpanded)} className="text-base shrink-0">
                🤖
              </button>
              <p className="flex-1 text-sm text-zinc-400 leading-relaxed">
                {coachData?.reply || "코치 추천 로딩 중..."}
              </p>
              <button
                type="button"
                onClick={() => setCoachExpanded(!coachExpanded)}
                className="text-xs text-zinc-600 hover:text-zinc-400 shrink-0"
              >
                {coachExpanded ? "접기 ▲" : "채팅 ▼"}
              </button>
            </div>

            {/* 질문 입력 (항상 보임) */}
            <div className="flex gap-2 mt-3">
              <input
                type="text"
                value={coachQ}
                onChange={(e) => setCoachQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && coachQ.trim()) sendCoachMessage(coachQ.trim())
                }}
                placeholder="코치에게 질문..."
                className="flex-1 px-3 py-1.5 rounded-lg text-xs text-white bg-zinc-800 border border-zinc-700 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />
              <button
                type="button"
                onClick={() => { if (coachQ.trim()) sendCoachMessage(coachQ.trim()) }}
                disabled={!coachQ.trim() || coachLoading}
                className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 bg-zinc-800 border border-zinc-700 hover:text-zinc-200 hover:border-zinc-600 transition-colors disabled:opacity-30"
              >
                질문
              </button>
            </div>
          </div>

          {/* 펼친 상태: 채팅 영역 */}
          {coachExpanded && (
            <div className="border-t border-zinc-800 max-h-[400px] overflow-y-auto px-6 py-4 space-y-3">
              {coachMessages.length === 0 && !coachLoading && (
                <p className="text-xs text-zinc-600 text-center py-4">질문을 입력하면 AI 코치가 답변합니다</p>
              )}
              {coachMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-blue-500/10 text-blue-100 rounded-br-md"
                      : "bg-zinc-800 text-zinc-200 rounded-bl-md"
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {coachLoading && (
                <div className="flex justify-start">
                  <div className="bg-zinc-800 rounded-2xl rounded-bl-md px-4 py-2.5 text-xs text-zinc-400">
                    <span className="animate-pulse">답변 생성 중...</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ═══ 하단 네비 ═══ */}
        <div className="flex gap-2 flex-wrap pt-2 border-t border-zinc-800">
          {[
            { t: "me", l: "캐릭터", i: "🥋" },
            { t: "journal", l: "수련 기록", i: "📝" },
            { t: "strategy", l: "전략", i: "🎯" },
            { t: "competition", l: "대회", i: "📅" },
          ].map(({ t, l, i }) => (
            <button
              key={t}
              type="button"
              onClick={() => onNavigate(t)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 hover:text-zinc-300 hover:border-zinc-700 transition-colors"
            >
              <span>{i}</span>
              <span>{l}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
