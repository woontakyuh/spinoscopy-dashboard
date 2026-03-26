"use client"

import { useState, useMemo, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import { PromDisplay } from "./PromDisplay"
import { PromChart } from "./PromChart"
import { PatientProfileView } from "./PatientProfileView"
import type { AnalyticsData, PatientRow, Dimension, TimepointParsed, DimensionSchema } from "@/lib/notion/analytics"
import type { PatientSearchResult } from "@/lib/types/patient"

/* ═══════════════════════════════════════════════════════════════════
   Constants & Types
   ═══════════════════════════════════════════════════════════════════ */

type FilterKey = Dimension
type ActiveFilters = Partial<Record<FilterKey, Set<string>>>

const TIMEPOINTS = ["pre", "1mo", "3mo", "6mo", "1y"]
const TIMEPOINT_LABELS: Record<string, string> = {
  pre: "수술 전", "1mo": "1개월", "3mo": "3개월", "6mo": "6개월", "1y": "1년",
}
const TIMEPOINT_MONTHS: Record<string, number> = {
  pre: 0, "1mo": 1, "3mo": 3, "6mo": 6, "1y": 12,
}
const MONTH_TICKS = [0, 1, 3, 6, 12]
const formatMonth = (v: number) => {
  const labels: Record<number, string> = { 0: "수술 전", 1: "1개월", 3: "3개월", 6: "6개월", 12: "1년" }
  return labels[v] ?? `${v}mo`
}

type Metric = keyof TimepointParsed

const DIMENSIONS: { key: Dimension; label: string; color: ColorKey }[] = [
  { key: "op_category", label: "수술 분류",     color: "emerald" },
  { key: "class_a",     label: "질환 분류",     color: "indigo" },
  { key: "class_b",     label: "세부 진단",     color: "amber" },
  { key: "hospital",    label: "병원",          color: "cyan" },
  { key: "surgeon",     label: "집도의",        color: "violet" },
]

const AXIS_STYLE  = { fill: "#71717a", fontSize: 11 }
const GRID_COLOR  = "#27272a"
const TOOLTIP_STYLE = {
  backgroundColor: "#18181b", border: "1px solid #3f3f46",
  borderRadius: 8, color: "#e4e4e7", fontSize: 12,
}

/* Subgroup line colors for comparison */
const SUBGROUP_COLORS = [
  "#60a5fa", "#f87171", "#34d399", "#facc15", "#a78bfa",
  "#fb923c", "#2dd4bf", "#e879f9", "#38bdf8", "#f472b6",
]

/* ═══════════════════════════════════════════════════════════════════
   Color System
   ═══════════════════════════════════════════════════════════════════ */

const colorMap = {
  emerald: {
    bar: "bg-emerald-500", barActive: "bg-emerald-400", barDim: "bg-emerald-500/40",
    ring: "ring-emerald-400/50", text: "text-emerald-400", dot: "bg-emerald-400",
  },
  indigo: {
    bar: "bg-indigo-500", barActive: "bg-indigo-400", barDim: "bg-indigo-500/40",
    ring: "ring-indigo-400/50", text: "text-indigo-400", dot: "bg-indigo-400",
  },
  amber: {
    bar: "bg-amber-500", barActive: "bg-amber-400", barDim: "bg-amber-500/40",
    ring: "ring-amber-400/50", text: "text-amber-400", dot: "bg-amber-400",
  },
  cyan: {
    bar: "bg-cyan-500", barActive: "bg-cyan-400", barDim: "bg-cyan-500/40",
    ring: "ring-cyan-400/50", text: "text-cyan-400", dot: "bg-cyan-400",
  },
  violet: {
    bar: "bg-violet-500", barActive: "bg-violet-400", barDim: "bg-violet-500/40",
    ring: "ring-violet-400/50", text: "text-violet-400", dot: "bg-violet-400",
  },
} as const

type ColorKey = keyof typeof colorMap

/* ═══════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════ */

function countBy(patients: PatientRow[], dim: Dimension): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const p of patients) {
    for (const v of p[dim]) {
      if (v) counts[v] = (counts[v] ?? 0) + 1
    }
  }
  return counts
}

function sortedEntries(record: Record<string, number>, limit: number): [string, number][] {
  return Object.entries(record)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100
}

function hasActiveFilters(filters: ActiveFilters): boolean {
  return Object.values(filters).some(s => s && s.size > 0)
}

function activeFilterCount(filters: ActiveFilters): number {
  let count = 0
  for (const s of Object.values(filters)) {
    if (s) count += s.size
  }
  return count
}

function buildQueryString(filters: ActiveFilters): string {
  const params = new URLSearchParams()
  for (const [key, valueSet] of Object.entries(filters) as [Dimension, Set<string> | undefined][]) {
    if (valueSet && valueSet.size > 0) {
      params.set(key, Array.from(valueSet).join(","))
    }
  }
  return params.toString()
}

/* ═══════════════════════════════════════════════════════════════════
   Sub-Components
   ═══════════════════════════════════════════════════════════════════ */

function ChartHeader({ title, color, count }: { title: string; color: ColorKey; count?: number }) {
  const c = colorMap[color]
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{title}</h3>
      </div>
      {count !== undefined && (
        <span className="text-[10px] text-zinc-600 num">{count}</span>
      )}
    </div>
  )
}

function DimensionBarChart({
  title, entries, activeKeys, onClickItem, color,
}: {
  title: string
  entries: [string, number][]
  activeKeys?: Set<string>
  onClickItem: (key: string) => void
  color: ColorKey
}) {
  const c = colorMap[color]
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
        <ChartHeader title={title} color={color} />
        <p className="text-zinc-600 text-xs text-center py-6">데이터 없음</p>
      </div>
    )
  }

  const maxCount = entries[0][1]
  const hasActive = activeKeys !== undefined && activeKeys.size > 0

  return (
    <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
      <ChartHeader title={title} color={color} count={entries.reduce((s, [, n]) => s + n, 0)} />
      <div className="space-y-[5px] mt-3">
        {entries.map(([key, count]) => {
          const isActive = activeKeys?.has(key) ?? false
          const isDimmed = hasActive && !isActive
          const pct = Math.max((count / maxCount) * 100, 3)

          return (
            <button
              key={key}
              onClick={() => onClickItem(key)}
              className={`
                w-full flex items-center gap-2 py-[5px] px-2.5 rounded-lg text-left
                transition-all duration-150 cursor-pointer group
                ${isActive ? `bg-zinc-700/50 ring-1 ${c.ring}` : "hover:bg-zinc-800/80"}
                ${isDimmed ? "opacity-50" : "opacity-100"}
              `}
            >
              {/* Checkmark for selected items */}
              <span className={`text-[10px] w-3 shrink-0 ${isActive ? c.text : "text-transparent"}`}>
                {isActive ? "✓" : "·"}
              </span>
              <span className={`text-xs w-[110px] shrink-0 truncate transition-colors ${
                isActive ? "text-zinc-100 font-medium" : "text-zinc-400 group-hover:text-zinc-300"
              }`}>
                {key}
              </span>
              <div className="flex-1 h-[7px] bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isActive ? c.barActive : isDimmed ? c.barDim : c.bar
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={`text-[11px] w-7 text-right num transition-colors ${
                isActive ? "text-zinc-200 font-medium" : "text-zinc-500"
              }`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Category-only bar chart (before data loads) ─── */

function DimensionCategoryChart({
  title, options, activeKeys, onClickItem, color,
}: {
  title: string
  options: { name: string; color: string }[]
  activeKeys?: Set<string>
  onClickItem: (key: string) => void
  color: ColorKey
}) {
  const c = colorMap[color]
  if (options.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
        <ChartHeader title={title} color={color} />
        <p className="text-zinc-600 text-xs text-center py-6">데이터 없음</p>
      </div>
    )
  }

  const hasActive = activeKeys !== undefined && activeKeys.size > 0

  return (
    <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
      <ChartHeader title={title} color={color} />
      <div className="flex flex-wrap gap-1.5 mt-3">
        {options.map(opt => {
          const isActive = activeKeys?.has(opt.name) ?? false
          const isDimmed = hasActive && !isActive
          return (
            <button
              key={opt.name}
              onClick={() => onClickItem(opt.name)}
              className={`
                inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs
                transition-all duration-150 cursor-pointer border
                ${isActive
                  ? `bg-zinc-700/50 ring-1 ${c.ring} border-zinc-600 text-zinc-100 font-medium`
                  : `border-zinc-700/50 text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-300`}
                ${isDimmed ? "opacity-50" : "opacity-100"}
              `}
            >
              {isActive && <span className={`text-[10px] ${c.text}`}>✓</span>}
              {opt.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Demographics Summary ─── */

function DemographicsSummary({ patients, groupBy, groupByLabel }: {
  patients: PatientRow[]
  groupBy?: Dimension | null
  groupByLabel?: string
}) {
  const stats = useMemo(() => {
    const ages = patients
      .map(p => parseInt(p.age, 10))
      .filter(a => !isNaN(a))
    const avgAge = ages.length > 0 ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length * 10) / 10 : null
    const minAge = ages.length > 0 ? Math.min(...ages) : null
    const maxAge = ages.length > 0 ? Math.max(...ages) : null

    const maleCount = patients.filter(p => p.sex === "M").length
    const femaleCount = patients.filter(p => p.sex === "F").length
    const totalSex = maleCount + femaleCount

    // Level distribution
    const levelCounts: Record<string, number> = {}
    for (const p of patients) {
      const lvl = p.level.trim()
      if (lvl) {
        const parts = lvl.split(/[,\s]+/).filter(Boolean)
        for (const part of parts) {
          levelCounts[part] = (levelCounts[part] ?? 0) + 1
        }
      }
    }
    const topLevels = Object.entries(levelCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)

    // Op name distribution
    const opCounts: Record<string, number> = {}
    for (const p of patients) {
      const op = p.op_name.trim()
      if (op) opCounts[op] = (opCounts[op] ?? 0) + 1
    }
    const topOps = Object.entries(opCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    // Op date range
    const dates = patients
      .map(p => p.op_date)
      .filter((d): d is string => d !== null)
      .sort()
    const earliestDate = dates[0] ?? null
    const latestDate = dates[dates.length - 1] ?? null

    // Subgroup breakdown
    let subgroups: { name: string; count: number; avgAge: number | null; maleRatio: number | null }[] = []
    if (groupBy) {
      const grouped: Record<string, PatientRow[]> = {}
      for (const p of patients) {
        for (const val of p[groupBy]) {
          if (!grouped[val]) grouped[val] = []
          grouped[val].push(p)
        }
      }
      subgroups = Object.entries(grouped)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 8)
        .map(([name, pts]) => {
          const subAges = pts.map(p => parseInt(p.age, 10)).filter(a => !isNaN(a))
          const subAvgAge = subAges.length > 0 ? Math.round(subAges.reduce((a, b) => a + b, 0) / subAges.length * 10) / 10 : null
          const subMale = pts.filter(p => p.sex === "M").length
          const subTotal = pts.filter(p => p.sex === "M" || p.sex === "F").length
          return {
            name,
            count: pts.length,
            avgAge: subAvgAge,
            maleRatio: subTotal > 0 ? Math.round((subMale / subTotal) * 100) : null,
          }
        })
    }

    return { avgAge, minAge, maxAge, maleCount, femaleCount, totalSex, topLevels, topOps, earliestDate, latestDate, subgroups }
  }, [patients, groupBy])

  return (
    <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4 animate-fade-in-up" style={{ animationDelay: "60ms" }}>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">코호트 인구통계</h3>
        <span className="text-[10px] text-zinc-600 num ml-auto">{patients.length}명</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Total */}
        <div className="bg-zinc-800/50 rounded-lg px-3 py-2.5">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">전체 환자</p>
          <p className="text-2xl font-semibold text-zinc-100 num leading-none">{patients.length}</p>
        </div>

        {/* Age */}
        <div className="bg-zinc-800/50 rounded-lg px-3 py-2.5">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">평균 연령</p>
          <p className="text-2xl font-semibold text-zinc-100 num leading-none">
            {stats.avgAge !== null ? stats.avgAge : "—"}
          </p>
          {stats.minAge !== null && stats.maxAge !== null && (
            <p className="text-[10px] text-zinc-600 mt-1 num">{stats.minAge}~{stats.maxAge}세</p>
          )}
        </div>

        {/* Sex ratio */}
        <div className="bg-zinc-800/50 rounded-lg px-3 py-2.5">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">성비 (M:F)</p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-semibold text-blue-400 num">{stats.maleCount}</span>
            <span className="text-zinc-600 text-xs">:</span>
            <span className="text-lg font-semibold text-pink-400 num">{stats.femaleCount}</span>
          </div>
          {stats.totalSex > 0 && (
            <p className="text-[10px] text-zinc-600 mt-0.5 num">
              M {Math.round((stats.maleCount / stats.totalSex) * 100)}% / F {Math.round((stats.femaleCount / stats.totalSex) * 100)}%
            </p>
          )}
        </div>

        {/* Op Date Range */}
        <div className="bg-zinc-800/50 rounded-lg px-3 py-2.5">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">수술 기간</p>
          {stats.earliestDate ? (
            <>
              <p className="text-sm font-medium text-zinc-200 num">{stats.earliestDate}</p>
              <p className="text-[10px] text-zinc-600 num">~ {stats.latestDate}</p>
            </>
          ) : (
            <p className="text-zinc-600 text-sm">—</p>
          )}
        </div>
      </div>

      {/* Subgroup breakdown */}
      {stats.subgroups.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">
            {groupByLabel ?? "비교 그룹"} 별 인구통계
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {stats.subgroups.map((sg, i) => (
              <div key={sg.name} className="bg-zinc-800/50 rounded-lg px-2.5 py-2 border-l-2" style={{ borderLeftColor: SUBGROUP_COLORS[i % SUBGROUP_COLORS.length] }}>
                <p className="text-xs text-zinc-200 font-medium truncate">{sg.name}</p>
                <p className="text-[10px] text-zinc-500 num mt-0.5">
                  {sg.count}명 · 평균 {sg.avgAge ?? "—"}세 · M {sg.maleRatio ?? "—"}%
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Level & Op distributions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        {stats.topLevels.length > 0 && (
          <div className="bg-zinc-800/50 rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">Level 분포 (상위)</p>
            <div className="flex flex-wrap gap-1.5">
              {stats.topLevels.map(([lvl, cnt]) => (
                <span key={lvl} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-700/50 text-xs">
                  <span className="text-zinc-300 font-medium">{lvl}</span>
                  <span className="text-zinc-500 num">{cnt}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {stats.topOps.length > 0 && (
          <div className="bg-zinc-800/50 rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">수술명 분포 (상위)</p>
            <div className="flex flex-wrap gap-1.5">
              {stats.topOps.map(([op, cnt]) => (
                <span key={op} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-700/50 text-xs">
                  <span className="text-zinc-300 font-medium truncate max-w-[140px]">{op}</span>
                  <span className="text-zinc-500 num">{cnt}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── PROM Trend Charts ─── */

function PromTrendCharts({ patients, groupBy }: { patients: PatientRow[]; groupBy?: Dimension | null }) {
  const charts = useMemo(() => {
    type ChartDef = {
      key: string
      title: string
      lines: { metric: Metric; label: string; color: string; yAxisId?: string }[]
      domain: [number, number]
      unit?: string
      dualAxis?: { id: string; domain: [number, number] }
      refLine?: { y: number; label: string }
    }

    const defs: ChartDef[] = [
      {
        key: "vas",
        title: "VAS (통증)",
        lines: [
          { metric: "vas_prox", label: "VAS Prox (Neck/Back)", color: "#60a5fa" },
          { metric: "vas_dist", label: "VAS Dist (Arm/Leg)", color: "#f87171" },
        ],
        domain: [0, 10],
      },
      {
        key: "disability",
        title: "ODI / NDI % (장애 지수)",
        lines: [
          { metric: "odi", label: "ODI %", color: "#34d399" },
          { metric: "ndi", label: "NDI %", color: "#2dd4bf" },
        ],
        domain: [0, 100],
        unit: "%",
        refLine: { y: 40, label: "중증" },
      },
      {
        key: "joa",
        title: "JOA (신경 기능)",
        lines: [
          { metric: "joa", label: "JOA", color: "#a78bfa" },
        ],
        domain: [0, 17],
        refLine: { y: 17, label: "만점" },
      },
      {
        key: "eq5d",
        title: "EQ-5D (삶의 질)",
        lines: [
          { metric: "eq5d_utility", label: "EQ-5D utility", color: "#fb923c", yAxisId: "utility" },
          { metric: "eq5d_vas",     label: "EQ VAS",        color: "#facc15", yAxisId: "vas" },
        ],
        domain: [0, 1],
        dualAxis: { id: "vas", domain: [0, 100] },
      },
    ]

    // If groupBy is active, build subgroups
    if (groupBy) {
      const grouped: Record<string, PatientRow[]> = {}
      for (const p of patients) {
        for (const val of p[groupBy]) {
          if (!grouped[val]) grouped[val] = []
          grouped[val].push(p)
        }
      }
      const subgroups = Object.entries(grouped)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 8)

      return defs.map(def => {
        // For grouped charts, we pick the primary metric (first line)
        const primaryMetric = def.lines[0]
        const chartData = TIMEPOINTS.map(tp => {
          const row: Record<string, string | number | null> = { name: TIMEPOINT_LABELS[tp], month: TIMEPOINT_MONTHS[tp] }
          for (const [sgName, sgPatients] of subgroups) {
            const vals = sgPatients
              .map(p => p.timepoints[tp]?.[primaryMetric.metric])
              .filter((v): v is number => v !== null && v !== undefined)
            row[sgName] = avg(vals)
          }
          return row
        })

        const hasData = subgroups.some(([sgName]) =>
          chartData.some(d => d[sgName] !== null)
        )

        return {
          ...def,
          chartData,
          hasData,
          isGrouped: true as const,
          subgroups: subgroups.map(([name], i) => ({
            name,
            color: SUBGROUP_COLORS[i % SUBGROUP_COLORS.length],
          })),
        }
      }).filter(c => c.hasData)
    }

    // Normal (non-grouped) mode
    return defs.map(def => {
      const chartData = TIMEPOINTS.map(tp => {
        const row: Record<string, string | number | null> = { name: TIMEPOINT_LABELS[tp], month: TIMEPOINT_MONTHS[tp] }
        for (const line of def.lines) {
          const vals = patients
            .map(p => p.timepoints[tp]?.[line.metric])
            .filter((v): v is number => v !== null && v !== undefined)
          row[line.label] = avg(vals)
        }
        return row
      })

      const hasData = def.lines.some(line =>
        chartData.some(d => d[line.label] !== null)
      )

      return { ...def, chartData, hasData, isGrouped: false as const, subgroups: [] as { name: string; color: string }[] }
    }).filter(c => c.hasData)
  }, [patients, groupBy])

  if (charts.length === 0) return null

  return (
    <div className="animate-fade-in-up" style={{ animationDelay: "120ms" }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          PROM 평균 추이 {groupBy ? "(그룹 비교)" : ""}
        </h3>
        <span className="text-[10px] text-zinc-600 num ml-auto">{patients.length}명 평균</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {charts.map(chart => (
          <div key={chart.key} className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
            <p className="text-zinc-400 text-xs font-medium uppercase tracking-wide mb-3">
              {chart.title}
              {chart.isGrouped && <span className="text-zinc-600 ml-1">(주 지표: {chart.lines[0].label})</span>}
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chart.chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                <XAxis type="number" dataKey="month" domain={[0, 12]} ticks={MONTH_TICKS} tickFormatter={formatMonth} tick={AXIS_STYLE} />
                {chart.dualAxis && !chart.isGrouped ? (
                  <>
                    <YAxis yAxisId="utility" domain={chart.domain} tick={AXIS_STYLE} width={36} />
                    <YAxis yAxisId="vas" orientation="right" domain={chart.dualAxis.domain} tick={AXIS_STYLE} width={32} />
                  </>
                ) : (
                  <YAxis
                    domain={chart.domain}
                    tick={AXIS_STYLE}
                    unit={chart.unit}
                    width={chart.unit === "%" ? 36 : 28}
                  />
                )}
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 10, color: "#a1a1aa" }} />
                {chart.refLine && (
                  <ReferenceLine
                    y={chart.refLine.y}
                    stroke="#52525b"
                    strokeDasharray="4 4"
                    label={{ value: chart.refLine.label, fill: "#71717a", fontSize: 10 }}
                  />
                )}
                {chart.isGrouped
                  ? chart.subgroups.map(sg => (
                      <Line
                        key={sg.name}
                        type="monotone"
                        dataKey={sg.name}
                        stroke={sg.color}
                        strokeWidth={2}
                        dot={{ r: 3, fill: sg.color }}
                        connectNulls={false}
                      />
                    ))
                  : chart.lines.map(line => (
                      <Line
                        key={line.metric}
                        yAxisId={chart.dualAxis ? (line.yAxisId ?? "utility") : undefined}
                        type="monotone"
                        dataKey={line.label}
                        stroke={line.color}
                        strokeWidth={2}
                        dot={{ r: 3, fill: line.color }}
                        connectNulls={false}
                        strokeDasharray={line.yAxisId === "vas" ? "5 3" : undefined}
                      />
                    ))
                }
              </LineChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Patient List with expandable PROM ─── */

function PatientListRow({ patient, isExpanded, onToggle }: {
  patient: PatientRow
  isExpanded: boolean
  onToggle: () => void
}) {
  const [promRecord, setPromRecord] = useState<Record<string, string> | null>(null)
  const [loading, setLoading] = useState(false)

  const handleToggle = useCallback(async () => {
    if (!isExpanded && !promRecord) {
      setLoading(true)
      try {
        const res = await fetch(`/api/notion/patients?pageId=${patient.page_id}`)
        if (res.ok) setPromRecord(await res.json())
      } catch { /* ignore */ }
      setLoading(false)
    }
    onToggle()
  }, [isExpanded, promRecord, patient.page_id, onToggle])

  const fakePatientResult: PatientSearchResult = {
    page_id: patient.page_id,
    url: "",
    name: patient.name,
    pt_no: "",
    age: patient.age,
    sex: patient.sex,
    op_date: patient.op_date,
    op_name: patient.op_name,
    hospital: patient.hospital,
  }

  return (
    <div className="border-b border-zinc-800/50 last:border-0">
      <button
        onClick={handleToggle}
        className={`w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/50 transition-colors ${
          isExpanded ? "bg-zinc-800/30" : ""
        }`}
      >
        <span className="text-[11px] text-zinc-500 w-[76px] shrink-0 num">{patient.op_date ?? "—"}</span>
        <span className="text-sm text-zinc-200 w-[64px] shrink-0 truncate font-medium">{patient.name || "—"}</span>
        <span className="text-xs text-zinc-500 w-[30px] shrink-0 num">{patient.age || "—"}</span>
        <span className={`text-xs w-[18px] shrink-0 font-medium ${
          patient.sex === "M" ? "text-blue-400" : patient.sex === "F" ? "text-pink-400" : "text-zinc-600"
        }`}>
          {patient.sex || "—"}
        </span>
        <span className="text-xs text-zinc-400 flex-1 truncate">{patient.op_name || "—"}</span>
        <span className="text-[11px] text-zinc-600 w-[80px] shrink-0 truncate">{patient.class_b.join(", ") || "—"}</span>
        <span className="text-[11px] text-zinc-600 w-[50px] shrink-0 truncate">{patient.level || "—"}</span>
        <span className="text-[11px] text-zinc-600 w-[50px] shrink-0 truncate">{patient.hospital.join(", ") || "—"}</span>
        <span className={`text-zinc-500 text-xs transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 bg-zinc-900/50 space-y-3">
          {loading && (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full bg-zinc-800" />)}
            </div>
          )}
          {promRecord && (
            <>
              <div className="border border-zinc-700/60 rounded-lg p-3 bg-zinc-900">
                <PromDisplay patient={fakePatientResult} />
              </div>
              <div className="border border-zinc-700/60 rounded-lg p-3 bg-zinc-900">
                <p className="text-zinc-400 text-xs font-medium mb-2">추이 그래프</p>
                <PromChart promRecord={promRecord} />
              </div>
              <PatientProfileView pageId={patient.page_id} />
            </>
          )}
          {!loading && !promRecord && (
            <p className="text-zinc-600 text-sm text-center py-3">PROM 데이터를 불러올 수 없습니다.</p>
          )}
        </div>
      )}
    </div>
  )
}

function PatientList({ patients }: { patients: PatientRow[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(30)

  const sorted = useMemo(() =>
    [...patients].sort((a, b) => (b.op_date ?? "").localeCompare(a.op_date ?? "")),
    [patients]
  )

  return (
    <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 overflow-hidden animate-fade-in-up" style={{ animationDelay: "180ms" }}>
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">환자 목록</h3>
        </div>
        <span className="text-[10px] text-zinc-600 num">{patients.length}명</span>
      </div>

      {/* Table header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-700/50 text-[10px] text-zinc-600 uppercase tracking-wider font-medium">
        <span className="w-[76px] shrink-0">수술일</span>
        <span className="w-[64px] shrink-0">이름</span>
        <span className="w-[30px] shrink-0">나이</span>
        <span className="w-[18px] shrink-0">성</span>
        <span className="flex-1">수술명</span>
        <span className="w-[80px] shrink-0">진단</span>
        <span className="w-[50px] shrink-0">Level</span>
        <span className="w-[50px] shrink-0">병원</span>
        <span className="w-[14px] shrink-0"></span>
      </div>

      {sorted.slice(0, visibleCount).map(p => (
        <PatientListRow
          key={p.page_id}
          patient={p}
          isExpanded={expandedId === p.page_id}
          onToggle={() => setExpandedId(prev => prev === p.page_id ? null : p.page_id)}
        />
      ))}

      {patients.length > visibleCount && (
        <div className="flex justify-center py-3 border-t border-zinc-800">
          <button
            onClick={() => setVisibleCount(prev => prev + 30)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            더보기 ({patients.length - visibleCount}명 남음)
          </button>
        </div>
      )}

      {patients.length === 0 && (
        <p className="text-zinc-600 text-sm text-center py-8">해당 조건에 환자가 없습니다.</p>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Group By Selector
   ═══════════════════════════════════════════════════════════════════ */

function GroupBySelector({
  value, onChange,
}: {
  value: Dimension | null
  onChange: (dim: Dimension | null) => void
  excludeDimensions?: Set<Dimension>
}) {
  // 모든 차원을 비교 기준으로 선택 가능 (필터 사용 여부 무관)
  const available = DIMENSIONS

  return (
    <div className="flex items-center gap-2 flex-wrap px-3 py-2.5 rounded-xl bg-zinc-900/80 border border-zinc-700/60 animate-fade-in-up">
      <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold shrink-0">비교 기준</span>
      {available.length === 0 ? (
        <span className="text-xs text-zinc-600">모든 차원이 필터로 사용 중</span>
      ) : (
        <>
          <button
            onClick={() => onChange(null)}
            className={`px-2.5 py-1 rounded-lg text-xs transition-all duration-150 border ${
              value === null
                ? "bg-zinc-700/50 border-zinc-500 text-zinc-200 font-medium"
                : "border-zinc-700/50 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/80"
            }`}
          >
            없음
          </button>
          {available.map(dim => {
            const isActive = value === dim.key
            const c = colorMap[dim.color]
            return (
              <button
                key={dim.key}
                onClick={() => onChange(isActive ? null : dim.key)}
                className={`px-2.5 py-1 rounded-lg text-xs transition-all duration-150 border ${
                  isActive
                    ? `bg-zinc-700/50 ring-1 ${c.ring} border-zinc-500 text-zinc-200 font-medium`
                    : "border-zinc-700/50 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/80"
                }`}
              >
                {dim.label}
              </button>
            )
          })}
        </>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════ */

export function ClinicsAnalytics() {
  const [filters, setFilters] = useState<ActiveFilters>({})
  const [groupBy, setGroupBy] = useState<Dimension | null>(null)

  const filtersActive = hasActiveFilters(filters)
  const filterCount = activeFilterCount(filters)

  // 1) Fetch categories (fast, cached 1hr) — always loaded
  const categoriesQuery = useQuery<DimensionSchema>({
    queryKey: ["clinicus-analytics-categories"],
    queryFn: async () => {
      const res = await fetch("/api/notion/analytics/categories")
      if (!res.ok) throw new Error("카테고리 조회 실패")
      return res.json()
    },
    staleTime: 60 * 60 * 1000,
  })

  // 2) Fetch patients only when filters are active
  const queryString = useMemo(() => buildQueryString(filters), [filters])

  const patientsQuery = useQuery<AnalyticsData>({
    queryKey: ["clinicus-analytics-patients", queryString],
    queryFn: async () => {
      const url = queryString
        ? `/api/notion/analytics?${queryString}`
        : "/api/notion/analytics"
      const res = await fetch(url)
      if (!res.ok) throw new Error("분석 데이터 조회 실패")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
    enabled: filtersActive,
    placeholderData: (prev) => prev,
  })

  const toggleFilter = useCallback((key: FilterKey, value: string) => {
    setFilters(prev => {
      const next = { ...prev }
      const currentSet = new Set(prev[key] ?? [])

      if (currentSet.has(value)) {
        currentSet.delete(value)
        if (currentSet.size === 0) {
          delete next[key]
        } else {
          next[key] = currentSet
        }
      } else {
        currentSet.add(value)
        next[key] = currentSet
      }

      return next
    })
    // Reset groupBy if it conflicts with the new filter
    setGroupBy(prev => {
      if (prev === key) return null
      return prev
    })
  }, [])

  const clearFilters = useCallback(() => {
    setFilters({})
    setGroupBy(null)
  }, [])

  const allPatients = patientsQuery.data?.patients ?? []

  // 서버에서 이미 필터된 결과를 사용 (이중 필터링 방지)
  const filtered = filtersActive ? allPatients : []

  // Aggregations per dimension (cross-filtering)
  // 전체 카테고리 목록(schema)을 기반으로, 필터된 데이터에서 카운트 계산
  const dimensionCounts = useMemo(() => {
    if (!filtersActive || allPatients.length === 0) return null
    const result: Record<Dimension, Record<string, number>> = {
      op_category: {}, class_a: {}, class_b: {}, surgeon: {}, hospital: {},
    }
    for (const dim of DIMENSIONS) {
      // 서버 결과에서 각 차원별 카운트 집계
      const counts = countBy(allPatients, dim.key)
      // schema에 있는 항목은 0이라도 포함 (전체 목록 유지)
      if (categoriesQuery.data?.[dim.key]) {
        for (const opt of categoriesQuery.data[dim.key]) {
          if (!(opt.name in counts)) counts[opt.name] = 0
        }
      }
      result[dim.key] = counts
    }
    return result
  }, [allPatients, filters, filtersActive, categoriesQuery.data])

  // Dimensions currently used as filters (for groupBy exclusion)
  const usedDimensions = useMemo(() => {
    const s = new Set<Dimension>()
    for (const [key, valueSet] of Object.entries(filters) as [Dimension, Set<string> | undefined][]) {
      if (valueSet && valueSet.size > 0) s.add(key)
    }
    return s
  }, [filters])

  /* ─── Loading categories ─── */
  if (categoriesQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-[72px] bg-zinc-800/60 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 bg-zinc-800/60 rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (categoriesQuery.error) {
    return (
      <p className="text-red-400 text-sm text-center py-8">
        카테고리 로드 실패: {(categoriesQuery.error as Error).message}
      </p>
    )
  }

  const schema = categoriesQuery.data

  return (
    <div className="space-y-4">

      {/* ═══════ Stat Cards ═══════ */}
      <div className="grid grid-cols-3 gap-3 animate-fade-in-up">
        <div className="card-hover rounded-xl border border-zinc-700/80 bg-zinc-900 px-4 py-3">
          <p className="text-[11px] text-zinc-500 font-medium tracking-wide mb-1">전체 DB</p>
          <p className="text-2xl font-semibold text-zinc-100 num leading-none">
            {schema ? Object.values(schema).reduce((max, opts) => Math.max(max, opts.length), 0) > 0 ? "—" : "0" : "—"}
          </p>
          <p className="text-[10px] text-zinc-600 mt-0.5">필터 적용 시 조회</p>
        </div>
        <div className="card-hover rounded-xl border border-zinc-700/80 bg-zinc-900 px-4 py-3">
          <p className="text-[11px] text-zinc-500 font-medium tracking-wide mb-1">필터 매칭</p>
          <p className={`text-2xl font-semibold num leading-none ${filtersActive ? "text-violet-400" : "text-zinc-600"}`}>
            {filtersActive ? (patientsQuery.isLoading ? "..." : filtered.length) : "—"}
          </p>
        </div>
        <div className="card-hover rounded-xl border border-zinc-700/80 bg-zinc-900 px-4 py-3">
          <p className="text-[11px] text-zinc-500 font-medium tracking-wide mb-1">활성 필터</p>
          <p className={`text-2xl font-semibold num leading-none ${filterCount > 0 ? "text-indigo-400" : "text-zinc-600"}`}>
            {filterCount}
          </p>
        </div>
      </div>

      {/* ═══════ Active Filters Bar ═══════ */}
      {filterCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-3 py-2.5 rounded-xl bg-indigo-950/40 border border-indigo-500/20 animate-fade-in-up">
          <span className="text-[11px] text-indigo-400 uppercase tracking-wider font-semibold">필터</span>
          {(Object.entries(filters) as [FilterKey, Set<string> | undefined][]).map(([key, valueSet]) => {
            if (!valueSet || valueSet.size === 0) return null
            const dimLabel = DIMENSIONS.find(d => d.key === key)?.label ?? key
            return Array.from(valueSet).map(val => (
              <button
                key={`${key}-${val}`}
                onClick={() => toggleFilter(key, val)}
                className="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full bg-zinc-800 text-zinc-300 text-xs border border-zinc-600/50 hover:border-zinc-500 hover:bg-zinc-700/80 transition-all duration-150 group"
              >
                <span className="text-zinc-500 text-[10px]">{dimLabel}</span>
                <span className="font-medium">{val}</span>
                <span className="text-zinc-500 group-hover:text-zinc-300 ml-0.5 transition-colors">x</span>
              </button>
            ))
          })}
          <button
            onClick={clearFilters}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2 decoration-zinc-700 hover:decoration-zinc-500"
          >
            전체 해제
          </button>
          <span className="text-[11px] text-zinc-500 ml-auto num">
            {filtersActive ? (patientsQuery.isLoading ? "조회 중..." : `${filtered.length}명 매칭`) : ""}
          </span>
        </div>
      )}

      {/* ═══════ Dimension Bar Charts / Category Chips ═══════ */}
      {filtersActive && dimensionCounts ? (
        /* Data loaded — show full bar charts with counts */
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in-up" style={{ animationDelay: "30ms" }}>
            {DIMENSIONS.slice(0, 2).map(dim => (
              <DimensionBarChart
                key={dim.key}
                title={dim.label}
                entries={sortedEntries(dimensionCounts[dim.key], 12)}
                activeKeys={filters[dim.key]}
                onClickItem={key => toggleFilter(dim.key, key)}
                color={dim.color}
              />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 animate-fade-in-up" style={{ animationDelay: "60ms" }}>
            {DIMENSIONS.slice(2).map(dim => (
              <DimensionBarChart
                key={dim.key}
                title={dim.label}
                entries={sortedEntries(dimensionCounts[dim.key], 10)}
                activeKeys={filters[dim.key]}
                onClickItem={key => toggleFilter(dim.key, key)}
                color={dim.color}
              />
            ))}
          </div>
        </>
      ) : (
        /* No data yet — show category chips from schema */
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in-up" style={{ animationDelay: "30ms" }}>
            {DIMENSIONS.slice(0, 2).map(dim => (
              <DimensionCategoryChart
                key={dim.key}
                title={dim.label}
                options={schema?.[dim.key] ?? []}
                activeKeys={filters[dim.key]}
                onClickItem={key => toggleFilter(dim.key, key)}
                color={dim.color}
              />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 animate-fade-in-up" style={{ animationDelay: "60ms" }}>
            {DIMENSIONS.slice(2).map(dim => (
              <DimensionCategoryChart
                key={dim.key}
                title={dim.label}
                options={schema?.[dim.key] ?? []}
                activeKeys={filters[dim.key]}
                onClickItem={key => toggleFilter(dim.key, key)}
                color={dim.color}
              />
            ))}
          </div>
        </>
      )}

      {/* ═══════ Prompt to select filters ═══════ */}
      {!filtersActive && (
        <div className="rounded-xl border border-dashed border-zinc-700/60 bg-zinc-900/50 py-12 text-center animate-fade-in-up">
          <p className="text-zinc-500 text-sm">필터를 선택하면 데이터가 로딩됩니다</p>
          <p className="text-zinc-600 text-xs mt-1">위 카테고리에서 하나 이상 선택해 주세요</p>
        </div>
      )}

      {/* ═══════ Loading skeleton for patient data ═══════ */}
      {filtersActive && patientsQuery.isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 bg-zinc-800/60 rounded-xl" />)}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1, 2].map(i => <Skeleton key={i} className="h-56 bg-zinc-800/60 rounded-xl" />)}
          </div>
          <Skeleton className="h-48 bg-zinc-800/60 rounded-xl" />
        </div>
      )}

      {/* ═══════ Error loading patients ═══════ */}
      {filtersActive && patientsQuery.error && (
        <p className="text-red-400 text-sm text-center py-8">
          데이터 로드 실패: {(patientsQuery.error as Error).message}
        </p>
      )}

      {/* ═══════ Data loaded — show results ═══════ */}
      {filtersActive && !patientsQuery.isLoading && !patientsQuery.error && patientsQuery.data && (
        <>
          {/* ═══════ Group By Selector ═══════ */}
          <GroupBySelector
            value={groupBy}
            onChange={setGroupBy}
            excludeDimensions={usedDimensions}
          />

          {/* ═══════ Demographics Summary ═══════ */}
          <DemographicsSummary
            patients={filtered}
            groupBy={groupBy}
            groupByLabel={groupBy ? DIMENSIONS.find(d => d.key === groupBy)?.label : undefined}
          />

          {/* ═══════ PROM Trend Charts ═══════ */}
          <PromTrendCharts patients={filtered} groupBy={groupBy} />

          {/* ═══════ Patient List ═══════ */}
          <PatientList patients={filtered} />

          {/* ═══════ Footer ═══════ */}
          {patientsQuery.data.fetchedAt && (
            <p className="text-zinc-700 text-xs text-right num">
              조회: {new Date(patientsQuery.data.fetchedAt).toLocaleString("ko-KR")} · 5분 캐시
            </p>
          )}
        </>
      )}
    </div>
  )
}
