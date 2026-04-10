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
import { useSenseiData } from "@/lib/sensei/useSenseiData"
import type { BjjStats, BjjAttributes, UserProfile } from "@/lib/types/sensei"

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
  { id: "black", color: "bg-card" },
]

function getClipPath(index: number, length: number) {
  if (index === 0) return "polygon(0% 0%, calc(100% - 1rem) 0%, 100% 50%, calc(100% - 1rem) 100%, 0% 100%)"
  if (index === length - 1) return "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 1rem 50%)"
  return "polygon(0% 0%, calc(100% - 1rem) 0%, 100% 50%, calc(100% - 1rem) 100%, 0% 100%, 1rem 50%)"
}

function fmtDur(m: number): string {
  const y = Math.floor(m / 12)
  const mo = m % 12
  if (y === 0) return `${mo}개월`
  if (mo === 0) return `${y}년`
  return `${y}년 ${mo}개월`
}

export function SenseiCharacterSheet() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
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

  const { archetypes } = useSenseiData()
  const arch = useMemo(() => {
    if (!data?.stats?.combined.closestArchetype) return null
    return archetypes.find((a) => a.name === data.stats.combined.closestArchetype) ?? null
  }, [data, archetypes])

  if (isLoading || !profile) {
    return <div className="flex justify-center py-20"><span className="text-sm text-muted-foreground animate-pulse">로딩 중...</span></div>
  }
  if (error || !data) {
    return <div className="text-center py-20"><p className="text-sm text-red-400">스탯을 불러올 수 없습니다</p></div>
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

  // Compare archetype radar
  const compareData = arch ? [
    { subject: "Guard", value: arch.stats.guard, fullMark: 100 },
    { subject: "Passing", value: arch.stats.passing, fullMark: 100 },
    { subject: "Control", value: arch.stats.control, fullMark: 100 },
    { subject: "Finishing", value: arch.stats.finishing, fullMark: 100 },
    { subject: "Takedowns", value: arch.stats.takedowns, fullMark: 100 },
    { subject: "Leg Locks", value: arch.stats.legLocks, fullMark: 100 },
  ] : null

  const mergedRadarData = radarData.map((d, i) => ({
    ...d,
    ...(compareData ? { compare: compareData[i].value } : {}),
  }))

  return (
    <div className="max-w-5xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] gap-0 bg-card border border-border rounded-2xl overflow-hidden">

        {/* ═══ 좌측: 풀바디 캐릭터 ═══ */}
        <div className="relative bg-muted flex flex-col items-center justify-end md:min-h-[700px]">
          <img
            src="/images/character_full.png"
            alt="Character"
            className="w-full max-w-[340px] h-auto object-contain"
            style={{ maxHeight: "100%" }}
          />
        </div>

        {/* ═══ 우측: 스탯 패널 ═══ */}
        <div className="p-6 flex flex-col gap-5">

          {/* 프로필 헤더 */}
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className="text-lg font-semibold text-foreground">Lv.{stats.level}</span>
              <span className="px-2 py-0.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs font-medium uppercase tracking-wider">
                {stats.belt} {"I".repeat(stats.beltStripes)}
              </span>
              <span className="px-2 py-0.5 rounded-full border border-border bg-muted text-muted-foreground text-xs">
                {activeStats.ovrRole}
              </span>
              {/* Gi/NoGi 토글 */}
              <div className="flex gap-1 ml-auto">
                <button
                  onClick={() => setGiMode("gi")}
                  className={`px-2 py-0.5 rounded text-xs transition-colors ${
                    giMode === "gi" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "text-muted-foreground border border-transparent"
                  }`}
                >
                  Gi
                </button>
                <button
                  onClick={() => setGiMode("nogi")}
                  className={`px-2 py-0.5 rounded text-xs transition-colors ${
                    giMode === "nogi" ? "bg-red-500/20 text-red-400 border border-red-500/30" : "text-muted-foreground border border-transparent"
                  }`}
                >
                  NoGi
                </button>
              </div>
            </div>

            {/* XP bar */}
            <div className="max-w-sm">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Lv.{stats.level} → Lv.{stats.level + 1}</span>
                <span>{stats.xpCurrent} / {stats.xpToNext} XP</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-orange-600 rounded-full" style={{ width: `${(stats.xpCurrent / stats.xpToNext) * 100}%` }} />
              </div>
            </div>

            {/* Quick stats row */}
            <div className="grid grid-cols-5 gap-3 mt-4 text-center">
              {[
                { v: fmtDur(stats.trainingMonths), l: "수련 기간" },
                { v: String(stats.totalSessions), l: "수련 횟수" },
                { v: `${stats.streaks.current}주`, l: "연속" },
                { v: `${stats.streaks.best}주`, l: "최장" },
                { v: `${Math.round(stats.giRatio * 100)}%`, l: "Gi 비율" },
              ].map(({ v, l }) => (
                <div key={l}>
                  <p className="text-sm font-semibold text-foreground">{v}</p>
                  <p className="text-[10px] text-muted-foreground">{l}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Chevron 벨트 */}
          <div className="flex items-center h-10 gap-0.5">
            {BELTS.map((belt, idx) => {
              const isPast = BELTS.findIndex((b) => b.id === stats.belt) >= idx
              return (
                <div
                  key={belt.id}
                  className={`relative h-full flex-1 ${belt.color} ${!isPast ? "opacity-40 grayscale" : ""}`}
                  style={{ clipPath: getClipPath(idx, BELTS.length) }}
                >
                  {belt.id === stats.belt && (
                    <div className="absolute right-6 top-0 h-full w-10 bg-background flex justify-evenly items-center py-1.5 px-0.5">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={String(i)} className={`w-1 h-full ${i < stats.beltStripes ? "bg-white" : "bg-muted"}`} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* 레이더 차트 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">능력치 레이더</h3>
              <span className="text-xs text-muted-foreground">OVR <span className="text-base font-semibold text-foreground">{activeStats.ovr}</span></span>
            </div>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={mergedRadarData}>
                  <PolarGrid stroke="#27272a" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                  <Radar name="Me" dataKey="value" stroke="#f97316" strokeWidth={2} fill="#f97316" fillOpacity={0.2} />
                  {arch && (
                    <Radar name={arch.name} dataKey="compare" stroke="#3f3f46" strokeWidth={1} fill="#3f3f46" fillOpacity={0.05} strokeDasharray="4 3" />
                  )}
                </RadarChart>
              </ResponsiveContainer>
            </div>
            {arch && (
              <p className="text-xs text-muted-foreground text-center">
                아키타입: {arch.flag} <span className="text-foreground/90">{arch.name}</span> — {arch.playstyle}
              </p>
            )}
          </div>

          {/* 6축 능력치 바 */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-4">6축 능력치</h3>
            <div className="space-y-3">
              {STAT_BARS.map((stat) => (
                <div key={stat.name} className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{stat.name}</span>
                    <span className="font-semibold text-foreground">{attrs[stat.key]}</span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
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
          <div className="pt-4 border-t border-border">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">최근 포커스</h3>
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
                <span className="text-xs text-muted-foreground/70">수련 기록이 쌓이면 표시됩니다</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
