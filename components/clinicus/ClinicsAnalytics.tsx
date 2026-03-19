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
import type { AnalyticsData, PatientRow, Dimension, TimepointParsed } from "@/lib/notion/analytics"
import type { PatientSearchResult } from "@/lib/types/patient"

/* ═══════════════════════════════════════════════════════════════════
   Constants & Types
   ═══════════════════════════════════════════════════════════════════ */

type FilterKey = Dimension
type ActiveFilters = Partial<Record<FilterKey, string>>

const TIMEPOINTS = ["pre", "1mo", "3mo", "6mo", "1y"]
const TIMEPOINT_LABELS: Record<string, string> = {
  pre: "수술 전", "1mo": "1개월", "3mo": "3개월", "6mo": "6개월", "1y": "1년",
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

function applyFilters(patients: PatientRow[], filters: ActiveFilters): PatientRow[] {
  return patients.filter(p => {
    for (const [key, value] of Object.entries(filters) as [Dimension, string][]) {
      if (!value) continue
      if (!p[key].includes(value)) return false
    }
    return true
  })
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
  title, entries, activeKey, onClickItem, color,
}: {
  title: string
  entries: [string, number][]
  activeKey?: string
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
  const hasActive = activeKey !== undefined

  return (
    <div className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
      <ChartHeader title={title} color={color} count={entries.reduce((s, [, n]) => s + n, 0)} />
      <div className="space-y-[5px] mt-3">
        {entries.map(([key, count]) => {
          const isActive = activeKey === key
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
              <span className={`text-xs w-[120px] shrink-0 truncate transition-colors ${
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

/* ─── Demographics Summary ─── */

function DemographicsSummary({ patients }: { patients: PatientRow[] }) {
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
        // Split comma/space separated levels
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

    return { avgAge, minAge, maxAge, maleCount, femaleCount, totalSex, topLevels, topOps, earliestDate, latestDate }
  }, [patients])

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

function PromTrendCharts({ patients }: { patients: PatientRow[] }) {
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

    return defs.map(def => {
      const chartData = TIMEPOINTS.map(tp => {
        const row: Record<string, string | number | null> = { name: TIMEPOINT_LABELS[tp] }
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

      return { ...def, chartData, hasData }
    }).filter(c => c.hasData)
  }, [patients])

  if (charts.length === 0) return null

  return (
    <div className="animate-fade-in-up" style={{ animationDelay: "120ms" }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">PROM 평균 추이</h3>
        <span className="text-[10px] text-zinc-600 num ml-auto">{patients.length}명 평균</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {charts.map(chart => (
          <div key={chart.key} className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
            <p className="text-zinc-400 text-xs font-medium uppercase tracking-wide mb-3">{chart.title}</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chart.chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                <XAxis dataKey="name" tick={AXIS_STYLE} />
                {chart.dualAxis ? (
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
                {chart.lines.map(line => (
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
                ))}
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
        <span className="text-sm text-zinc-200 w-[80px] shrink-0 truncate font-medium">{patient.name || "—"}</span>
        <span className="text-xs text-zinc-500 w-[36px] shrink-0 num">{patient.age || "—"}</span>
        <span className={`text-xs w-[20px] shrink-0 font-medium ${
          patient.sex === "M" ? "text-blue-400" : patient.sex === "F" ? "text-pink-400" : "text-zinc-600"
        }`}>
          {patient.sex || "—"}
        </span>
        <span className="text-xs text-zinc-400 flex-1 truncate">{patient.op_name || "—"}</span>
        <span className="text-[11px] text-zinc-600 w-[60px] shrink-0 truncate">{patient.level || "—"}</span>
        <span className="text-[11px] text-zinc-600 w-[80px] shrink-0 num">{patient.op_date ?? "—"}</span>
        <span className="text-[11px] text-zinc-600 w-[60px] shrink-0 truncate">{patient.hospital.join(", ") || "—"}</span>
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
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-700/50 text-[10px] text-zinc-600 uppercase tracking-wider font-medium">
        <span className="w-[80px] shrink-0">이름</span>
        <span className="w-[36px] shrink-0">나이</span>
        <span className="w-[20px] shrink-0">성별</span>
        <span className="flex-1">수술명</span>
        <span className="w-[60px] shrink-0">Level</span>
        <span className="w-[80px] shrink-0">날짜</span>
        <span className="w-[60px] shrink-0">병원</span>
        <span className="w-[16px] shrink-0"></span>
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
   Main Component
   ═══════════════════════════════════════════════════════════════════ */

export function ClinicsAnalytics() {
  const [filters, setFilters] = useState<ActiveFilters>({})

  const { data, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ["clinicus-analytics-all"],
    queryFn: async () => {
      const res = await fetch("/api/notion/analytics")
      if (!res.ok) throw new Error("분석 데이터 조회 실패")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const toggleFilter = (key: FilterKey, value: string) => {
    setFilters(prev => {
      if (prev[key] === value) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return { ...prev, [key]: value }
    })
  }

  const clearFilters = () => setFilters({})

  const allPatients = data?.patients ?? []
  const filtered = useMemo(() => applyFilters(allPatients, filters), [allPatients, filters])

  const activeFilterCount = Object.keys(filters).length

  // Aggregations per dimension (computed on filtered set for cross-filtering)
  const dimensionCounts = useMemo(() => {
    const result: Record<Dimension, Record<string, number>> = {
      op_category: {}, class_a: {}, class_b: {}, surgeon: {}, hospital: {},
    }
    for (const dim of DIMENSIONS) {
      // For cross-filtering: exclude current dimension's filter when computing its counts
      const otherFilters = { ...filters }
      delete otherFilters[dim.key]
      const subFiltered = applyFilters(allPatients, otherFilters)
      result[dim.key] = countBy(subFiltered, dim.key)
    }
    return result
  }, [allPatients, filters])

  /* ─── Loading ─── */
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-[72px] bg-zinc-800/60 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-48 bg-zinc-800/60 rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <p className="text-red-400 text-sm text-center py-8">
        데이터 로드 실패: {(error as Error).message}
      </p>
    )
  }

  return (
    <div className="space-y-4">

      {/* ═══════ Stat Cards ═══════ */}
      <div className="grid grid-cols-3 gap-3 animate-fade-in-up">
        <div className="card-hover rounded-xl border border-zinc-700/80 bg-zinc-900 px-4 py-3">
          <p className="text-[11px] text-zinc-500 font-medium tracking-wide mb-1">전체 DB</p>
          <p className="text-2xl font-semibold text-zinc-100 num leading-none">{allPatients.length}</p>
        </div>
        <div className="card-hover rounded-xl border border-zinc-700/80 bg-zinc-900 px-4 py-3">
          <p className="text-[11px] text-zinc-500 font-medium tracking-wide mb-1">필터 적용</p>
          <p className={`text-2xl font-semibold num leading-none ${activeFilterCount > 0 ? "text-violet-400" : "text-zinc-100"}`}>
            {filtered.length}
          </p>
        </div>
        <div className="card-hover rounded-xl border border-zinc-700/80 bg-zinc-900 px-4 py-3">
          <p className="text-[11px] text-zinc-500 font-medium tracking-wide mb-1">활성 필터</p>
          <p className={`text-2xl font-semibold num leading-none ${activeFilterCount > 0 ? "text-indigo-400" : "text-zinc-600"}`}>
            {activeFilterCount}
          </p>
        </div>
      </div>

      {/* ═══════ Active Filters Bar ═══════ */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-3 py-2.5 rounded-xl bg-indigo-950/40 border border-indigo-500/20 animate-fade-in-up">
          <span className="text-[11px] text-indigo-400 uppercase tracking-wider font-semibold">필터</span>
          {(Object.entries(filters) as [FilterKey, string][]).map(([key, val]) => {
            const dimLabel = DIMENSIONS.find(d => d.key === key)?.label ?? key
            return (
              <button
                key={key}
                onClick={() => toggleFilter(key, val)}
                className="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full bg-zinc-800 text-zinc-300 text-xs border border-zinc-600/50 hover:border-zinc-500 hover:bg-zinc-700/80 transition-all duration-150 group"
              >
                <span className="text-zinc-500 text-[10px]">{dimLabel}</span>
                <span className="font-medium">{val}</span>
                <span className="text-zinc-500 group-hover:text-zinc-300 ml-0.5 transition-colors">x</span>
              </button>
            )
          })}
          <button
            onClick={clearFilters}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2 decoration-zinc-700 hover:decoration-zinc-500"
          >
            전체 해제
          </button>
          <span className="text-[11px] text-zinc-500 ml-auto num">{filtered.length}명 매칭</span>
        </div>
      )}

      {/* ═══════ Cross-Filter Bar Charts ═══════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in-up" style={{ animationDelay: "30ms" }}>
        {DIMENSIONS.slice(0, 2).map(dim => (
          <DimensionBarChart
            key={dim.key}
            title={dim.label}
            entries={sortedEntries(dimensionCounts[dim.key], 12)}
            activeKey={filters[dim.key]}
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
            activeKey={filters[dim.key]}
            onClickItem={key => toggleFilter(dim.key, key)}
            color={dim.color}
          />
        ))}
      </div>

      {/* ═══════ Demographics Summary ═══════ */}
      <DemographicsSummary patients={filtered} />

      {/* ═══════ PROM Trend Charts ═══════ */}
      <PromTrendCharts patients={filtered} />

      {/* ═══════ Patient List ═══════ */}
      <PatientList patients={filtered} />

      {/* ═══════ Footer ═══════ */}
      {data?.fetchedAt && (
        <p className="text-zinc-700 text-xs text-right num">
          조회: {new Date(data.fetchedAt).toLocaleString("ko-KR")} · 5분 캐시
        </p>
      )}
    </div>
  )
}
