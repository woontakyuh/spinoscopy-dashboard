"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { RadarChart } from "./RadarChart"
import { StatBar } from "./StatBar"
import { XPBar } from "./XPBar"
import { ARCHETYPES } from "@/lib/sensei/archetypes"
import type { BjjStats, Archetype } from "@/lib/types/sensei"

const BELT_COLORS: Record<string, string> = {
  white: "#e4e4e7",
  blue: "#3b82f6",
  purple: "#a855f7",
  brown: "#92400e",
  black: "#18181b",
}

const BELT_BORDER: Record<string, string> = {
  white: "border-zinc-300",
  blue: "border-blue-500",
  purple: "border-purple-500",
  brown: "border-amber-700",
  black: "border-zinc-400",
}

const ATTR_COLORS = {
  guard: "#a855f7",
  passing: "#22c55e",
  control: "#f97316",
  finishing: "#ef4444",
  takedowns: "#06b6d4",
  legLocks: "#eab308",
}

const ATTR_LABELS = {
  guard: "Guard",
  passing: "Passing",
  control: "Control",
  finishing: "Finishing",
  takedowns: "Takedowns",
  legLocks: "Leg Locks",
}

function findClosestArchetype(stats: BjjStats): Archetype | null {
  let bestMatch: Archetype | null = null
  let bestDistance = Infinity

  for (const arch of ARCHETYPES) {
    const d = Math.sqrt(
      (stats.combined.attributes.guard - arch.stats.guard) ** 2 +
      (stats.combined.attributes.passing - arch.stats.passing) ** 2 +
      (stats.combined.attributes.control - arch.stats.control) ** 2 +
      (stats.combined.attributes.finishing - arch.stats.finishing) ** 2 +
      (stats.combined.attributes.takedowns - arch.stats.takedowns) ** 2 +
      (stats.combined.attributes.legLocks - arch.stats.legLocks) ** 2
    )
    if (d < bestDistance) {
      bestDistance = d
      bestMatch = arch
    }
  }
  return bestMatch
}

interface StatsResponse {
  stats: BjjStats
  tagFrequencies: Record<string, number>
}

export function SenseiCharacterSheet() {
  const [compareArchetype, setCompareArchetype] = useState<Archetype | null>(null)

  const { data, isLoading, isError, error } = useQuery<StatsResponse>({
    queryKey: ["sensei-stats"],
    queryFn: async () => {
      const res = await fetch("/api/notion/sensei/stats")
      if (!res.ok) throw new Error("스탯 조회 실패")
      return res.json()
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-40 bg-zinc-800 rounded-xl" />
        <div className="h-72 bg-zinc-800 rounded-xl" />
      </div>
    )
  }

  if (isError) {
    return <p className="text-red-400 text-sm">오류: {(error as Error).message}</p>
  }

  if (!data) return null

  const { stats } = data
  const closestArchetype = findClosestArchetype(stats)

  return (
    <div className="space-y-4">
      {/* Profile Card */}
      <div className={`border ${BELT_BORDER[stats.belt] || "border-zinc-700"} rounded-xl p-4 bg-zinc-900`}>
        <div className="flex items-start gap-4">
          {/* Belt & OVR */}
          <div className="flex flex-col items-center gap-1">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-black border-2"
              style={{
                borderColor: BELT_COLORS[stats.belt] || "#3f3f46",
                background: `${BELT_COLORS[stats.belt] || "#18181b"}15`,
              }}
            >
              {stats.combined.ovr}
            </div>
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{stats.combined.ovrRole}</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-white">Lv.{stats.level}</h2>
              <Badge
                variant="outline"
                className="text-[10px] uppercase tracking-wider"
                style={{
                  borderColor: BELT_COLORS[stats.belt],
                  color: BELT_COLORS[stats.belt] === "#18181b" ? "#a1a1aa" : BELT_COLORS[stats.belt],
                }}
              >
                {stats.belt} belt {stats.beltStripes > 0 && `${"▎".repeat(stats.beltStripes)}`}
              </Badge>
              <Badge variant="outline" className="text-[10px] border-zinc-600 text-zinc-400">
                {stats.playstyle}
              </Badge>
            </div>

            <XPBar current={stats.xpCurrent} total={stats.xpToNext} level={stats.level} />

            {/* Quick Stats */}
            <div className="flex flex-wrap gap-3 mt-3">
              <div className="text-center">
                <p className="text-lg font-bold text-white">{Math.floor(stats.trainingMonths / 12)}년 {stats.trainingMonths % 12}개월</p>
                <p className="text-[10px] text-zinc-500">수련 기간</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-white">{stats.totalSessions}</p>
                <p className="text-[10px] text-zinc-500">기록된 수련</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-orange-400">{stats.streaks.current}주</p>
                <p className="text-[10px] text-zinc-500">연속</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-yellow-400">{stats.streaks.best}주</p>
                <p className="text-[10px] text-zinc-500">최장</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-blue-400">{Math.round(stats.giRatio * 100)}%</p>
                <p className="text-[10px] text-zinc-500">Gi 비율</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Radar Chart */}
      <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-zinc-300">능력치 레이더</h3>
          {closestArchetype && (
            <button
              type="button"
              onClick={() =>
                setCompareArchetype((prev) =>
                  prev?.name === closestArchetype.name ? null : closestArchetype
                )
              }
              className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                compareArchetype
                  ? "border-blue-500/40 text-blue-300 bg-blue-500/10"
                  : "border-zinc-600 text-zinc-400 hover:text-zinc-300"
              }`}
            >
              {compareArchetype ? `vs ${compareArchetype.name}` : `Compare: ${closestArchetype.name}`}
            </button>
          )}
        </div>
        <RadarChart
          attributes={stats.combined.attributes}
          compareAttributes={compareArchetype?.stats ?? null}
          compareName={compareArchetype?.name}
        />
        {closestArchetype && !compareArchetype && (
          <p className="text-center text-[10px] text-zinc-500 mt-1">
            가장 유사한 아키타입: <span className="text-zinc-300">{closestArchetype.flag} {closestArchetype.name}</span>
            {" — "}
            <span className="text-zinc-400">{closestArchetype.playstyle}</span>
          </p>
        )}
      </div>

      {/* Stat Bars */}
      <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900 space-y-3">
        <h3 className="text-sm font-medium text-zinc-300">6축 능력치</h3>
        {(Object.keys(ATTR_LABELS) as (keyof typeof ATTR_LABELS)[]).map((key) => (
          <StatBar
            key={key}
            label={ATTR_LABELS[key]}
            value={stats.combined.attributes[key]}
            color={ATTR_COLORS[key]}
          />
        ))}
      </div>

      {/* Recent Focus */}
      {stats.recentFocus.length > 0 && (
        <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900">
          <h3 className="text-sm font-medium text-zinc-300 mb-2">최근 포커스</h3>
          <div className="flex flex-wrap gap-1.5">
            {stats.recentFocus.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="text-xs border-orange-500/40 text-orange-300"
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
