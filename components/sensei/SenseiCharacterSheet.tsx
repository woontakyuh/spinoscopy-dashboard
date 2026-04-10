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
import { calculateOvr } from "@/lib/sensei/ovr"
import type { BjjStats, BjjAttributes, UserProfile, Archetype } from "@/lib/types/sensei"

const STAT_AXES: { key: keyof BjjAttributes; name: string; color: string; hex: string }[] = [
  { key: "guard", name: "Guard", color: "bg-purple-500", hex: "#a855f7" },
  { key: "passing", name: "Passing", color: "bg-green-500", hex: "#22c55e" },
  { key: "control", name: "Control", color: "bg-orange-600", hex: "#ea580c" },
  { key: "finishing", name: "Finishing", color: "bg-red-500", hex: "#ef4444" },
  { key: "takedowns", name: "Takedowns", color: "bg-cyan-500", hex: "#06b6d4" },
  { key: "legLocks", name: "Leg Locks", color: "bg-yellow-500", hex: "#eab308" },
]

const BELTS = [
  { id: "white", bg: "bg-zinc-200", label: "White" },
  { id: "blue", bg: "bg-blue-600", label: "Blue" },
  { id: "purple", bg: "bg-purple-600", label: "Purple" },
  { id: "brown", bg: "bg-amber-800", label: "Brown" },
  { id: "black", bg: "bg-zinc-900 border border-zinc-700", label: "Black" },
]

function fmtDur(m: number): string {
  const y = Math.floor(m / 12)
  const mo = m % 12
  if (y === 0) return `${mo}개월`
  if (mo === 0) return `${y}년`
  return `${y}년 ${mo}개월`
}

function cosineSimilarity(a: BjjAttributes, b: BjjAttributes): number {
  const keys: (keyof BjjAttributes)[] = ["guard", "passing", "control", "finishing", "takedowns", "legLocks"]
  let dot = 0, magA = 0, magB = 0
  for (const k of keys) {
    dot += a[k] * b[k]
    magA += a[k] ** 2
    magB += b[k] ** 2
  }
  if (magA === 0 || magB === 0) return 0
  return Math.round((dot / (Math.sqrt(magA) * Math.sqrt(magB))) * 100)
}

type CatFilter = "all" | "gi-legend" | "gi-active" | "nogi" | "special"

export function SenseiCharacterSheet() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [giMode, setGiMode] = useState<"gi" | "nogi">("gi")
  const [compareArch, setCompareArch] = useState<Archetype | null>(null)
  const [catFilter, setCatFilter] = useState<CatFilter>("all")

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

  // Auto-match closest archetype
  const closestArch = useMemo(() => {
    if (!data?.stats) return null
    const myAttrs = data.stats[giMode].attributes
    let best: Archetype | null = null
    let bestSim = 0
    for (const a of archetypes) {
      const sim = cosineSimilarity(myAttrs, a.stats)
      if (sim > bestSim) { bestSim = sim; best = a }
    }
    return best ? { arch: best, similarity: bestSim } : null
  }, [data, archetypes, giMode])

  // Active compare (explicit click or auto closest)
  const activeCompare = compareArch ?? closestArch?.arch ?? null

  const filteredArchetypes = useMemo(() => {
    if (catFilter === "all") return archetypes
    return archetypes.filter((a) => a.category === catFilter)
  }, [archetypes, catFilter])

  if (isLoading || !profile) {
    return <div className="flex justify-center py-20"><span className="text-sm text-muted-foreground animate-pulse">로딩 중...</span></div>
  }
  if (error || !data) {
    return <div className="text-center py-20"><p className="text-sm text-red-400">스탯을 불러올 수 없습니다</p></div>
  }

  const { stats, tagFrequencies } = data
  const activeStats = stats[giMode]
  const attrs = activeStats.attributes

  const radarData = STAT_AXES.map((s) => ({
    subject: s.name,
    value: attrs[s.key],
    ...(activeCompare ? { compare: activeCompare.stats[s.key] } : {}),
    fullMark: 100,
  }))

  // Weakest axis for growth recommendation
  const weakest = STAT_AXES.reduce((min, s) => attrs[s.key] < attrs[min.key] ? s : min, STAT_AXES[0])

  const beltIdx = BELTS.findIndex((b) => b.id === stats.belt)

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* ═══ 1. Profile Header — FIFA Card Style ═══ */}
      <div className="bg-card border border-border rounded-2xl p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          {/* OVR */}
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-amber-600 to-yellow-500 flex flex-col items-center justify-center shadow-lg">
              <span className="text-3xl font-black text-white leading-none">{activeStats.ovr}</span>
              <span className="text-[9px] font-semibold text-white/80 tracking-wider">OVR</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Lv.{stats.level} {profile.name || "Tak"}</h2>
              <p className="text-sm text-muted-foreground">{activeStats.ovrRole} · {stats.playstyle}</p>
              {/* XP */}
              <div className="mt-1.5 w-48">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                  <span>Lv.{stats.level} → {stats.level + 1}</span>
                  <span>{stats.xpCurrent}/{stats.xpToNext}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full" style={{ width: `${(stats.xpCurrent / stats.xpToNext) * 100}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Gi/NoGi toggle */}
          <div className="flex gap-1 md:ml-auto">
            {(["gi", "nogi"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setGiMode(m)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  giMode === m
                    ? m === "gi" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"
                    : "text-muted-foreground border border-transparent"
                }`}
              >
                {m === "gi" ? "Gi" : "NoGi"}
              </button>
            ))}
          </div>
        </div>

        {/* Belt visual */}
        <div className="flex items-center gap-0.5 mt-4 h-8">
          {BELTS.map((belt, idx) => (
            <div
              key={belt.id}
              className={`relative flex-1 h-full rounded-sm ${belt.bg} ${idx > beltIdx ? "opacity-25 grayscale" : ""} transition-all`}
            >
              {belt.id === stats.belt && (
                <div className="absolute right-2 top-0 h-full flex items-center gap-px">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={String(i)} className={`w-0.5 h-4 rounded-full ${i < stats.beltStripes ? "bg-white" : "bg-white/20"}`} />
                  ))}
                </div>
              )}
              <span className="absolute inset-0 flex items-center justify-center text-[8px] font-semibold text-white/60">{belt.label}</span>
            </div>
          ))}
        </div>

        {/* Quick stats 3-grid */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            { v: fmtDur(stats.trainingMonths), l: "수련 기간" },
            { v: String(stats.totalSessions), l: "총 세션" },
            { v: String(stats.sessions2026), l: "올해 세션" },
          ].map(({ v, l }) => (
            <div key={l} className="text-center bg-muted rounded-lg py-2">
              <p className="text-base font-bold text-foreground">{v}</p>
              <p className="text-[10px] text-muted-foreground">{l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ 2. Radar + Progress Bars ═══ */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-muted-foreground">능력치 레이더</h3>
          {activeCompare && (
            <span className="text-[10px] text-muted-foreground">
              비교: <span className="text-foreground/80">{activeCompare.flag} {activeCompare.name}</span>
            </span>
          )}
        </div>

        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="72%" data={radarData}>
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
              <Radar name="Me" dataKey="value" stroke="#f97316" strokeWidth={2} fill="#f97316" fillOpacity={0.2} />
              {activeCompare && (
                <Radar name={activeCompare.name} dataKey="compare" stroke="var(--muted-foreground)" strokeWidth={1.5} fill="none" strokeDasharray="5 3" />
              )}
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* 6-axis progress bars with compare marker */}
        <div className="space-y-2.5 mt-4">
          {STAT_AXES.map((stat) => {
            const myVal = attrs[stat.key]
            const compVal = activeCompare?.stats[stat.key]
            return (
              <div key={stat.name}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-muted-foreground">{stat.name}</span>
                  <span className="font-semibold text-foreground">{myVal}</span>
                </div>
                <div className="relative w-full h-2 bg-muted rounded-full overflow-visible">
                  <div
                    className={`h-full ${stat.color} rounded-full transition-all duration-500`}
                    style={{ width: `${myVal}%` }}
                  />
                  {compVal !== undefined && (
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-1 h-4 rounded-full bg-foreground/40"
                      style={{ left: `${compVal}%` }}
                      title={`${activeCompare?.name}: ${compVal}`}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ═══ 3. Archetype Comparison (SenseiHeroes inline) ═══ */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">선수 비교</h3>
          {closestArch && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400">
              가장 가까운 스타일: {closestArch.arch.flag} {closestArch.arch.name} — {closestArch.similarity}%
            </span>
          )}
        </div>

        {/* Category filter */}
        <div className="flex gap-1 mb-3 flex-wrap">
          {([
            { id: "all", label: "전체" },
            { id: "gi-legend", label: "Gi Legend" },
            { id: "gi-active", label: "Gi Active" },
            { id: "nogi", label: "NoGi" },
            { id: "special", label: "Special" },
          ] as { id: CatFilter; label: string }[]).map((f) => (
            <button
              key={f.id}
              onClick={() => setCatFilter(f.id)}
              className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                catFilter === f.id
                  ? "bg-orange-600 text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Horizontal scroll cards */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {filteredArchetypes.map((a) => {
            const sim = cosineSimilarity(attrs, a.stats)
            const isActive = activeCompare?.name === a.name
            return (
              <button
                key={a.name}
                type="button"
                onClick={() => setCompareArch(isActive ? null : a)}
                className={`shrink-0 w-28 rounded-xl border p-2.5 text-center transition-all ${
                  isActive
                    ? "border-orange-500 bg-orange-500/10 ring-1 ring-orange-500/30"
                    : "border-border bg-muted/50 hover:border-foreground/20"
                }`}
              >
                <div className="text-lg">{a.flag}</div>
                <p className="text-xs font-semibold text-foreground truncate">{a.name}</p>
                <p className="text-[9px] text-muted-foreground truncate">{a.playstyle}</p>
                <div className="mt-1">
                  <span className="text-[10px] font-bold text-amber-500">{calculateOvr(a.stats).ovr}</span>
                  <span className="text-[9px] text-muted-foreground ml-1">{sim}%</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ═══ 4. Growth Recommendations ═══ */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground">성장 추천</h3>

        {/* Weakest axis */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg" style={{ backgroundColor: weakest.hex + "20", color: weakest.hex }}>
            ↑
          </div>
          <div>
            <p className="text-sm text-foreground font-medium">
              <span style={{ color: weakest.hex }}>{weakest.name}</span> 강화 권장
            </p>
            <p className="text-xs text-muted-foreground">
              현재 {attrs[weakest.key]}점 — 가장 낮은 영역. 이 분야 수업과 스파링 비중을 늘려보세요.
            </p>
          </div>
        </div>

        {/* Recent focus */}
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">최근 포커스</h4>
          <div className="flex flex-wrap gap-1.5">
            {stats.recentFocus.length > 0 ? stats.recentFocus.map((tag) => (
              <span key={tag} className="px-2 py-0.5 bg-orange-900/20 text-orange-400 border border-orange-900/40 rounded text-[11px]">
                {tag}
                {tagFrequencies[tag] ? <span className="ml-1 text-orange-600">{tagFrequencies[tag]}</span> : null}
              </span>
            )) : (
              <span className="text-xs text-muted-foreground/60">수련 기록이 쌓이면 표시됩니다</span>
            )}
          </div>
        </div>

        {/* Learning cycles */}
        {(stats.completedCycles.length > 0 || stats.inProgressCycles.length > 0) && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2">학습 사이클</h4>
            <div className="space-y-1.5">
              {stats.inProgressCycles.map((c, i) => (
                <div key={`ip-${i}`} className="flex items-center gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                  <span className="text-foreground/80">{c.tag}</span>
                  <span className="text-muted-foreground ml-auto">
                    {[c.study && "학습", c.class && "수업", c.sparring && "스파링"].filter(Boolean).join("·")}
                  </span>
                </div>
              ))}
              {stats.completedCycles.slice(0, 3).map((c, i) => (
                <div key={`c-${i}`} className="flex items-center gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                  <span className="text-foreground/60 line-through">{c.tag}</span>
                  <span className="text-muted-foreground ml-auto">완료</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
