"use client"

import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import type { AnalyticsData, PatientRow, Dimension, TimepointParsed, DimensionSchema } from "@/lib/notion/analytics"

const TIMEPOINT_LABELS: Record<string, string> = {
  pre: "수술 전", "1mo": "1개월", "3mo": "3개월", "6mo": "6개월", "1y": "1년",
}
const TIMEPOINTS = ["pre", "1mo", "3mo", "6mo", "1y"]

const ALL_DIMENSIONS: { key: Dimension; label: string }[] = [
  { key: "op_category", label: "수술 분류" },
  { key: "class_a",     label: "질환 분류 (ClassA)" },
  { key: "class_b",     label: "세부 진단 (ClassB)" },
  { key: "surgeon",     label: "집도의" },
  { key: "hospital",    label: "병원" },
]

type Metric = keyof TimepointParsed

const METRIC_CHARTS: { key: Metric; label: string; unit: string; domain: [number, number] }[] = [
  { key: "vas_prox",     label: "VAS ① (Neck/Back)", unit: "",  domain: [0, 10] },
  { key: "vas_dist",     label: "VAS ② (Arm/Leg)",   unit: "",  domain: [0, 10] },
  { key: "odi",          label: "ODI %",              unit: "%", domain: [0, 100] },
  { key: "ndi",          label: "NDI %",              unit: "%", domain: [0, 100] },
  { key: "joa",          label: "JOA",                unit: "",  domain: [0, 17] },
  { key: "eq5d_utility", label: "EQ-5D utility",      unit: "",  domain: [0, 1] },
  { key: "eq5d_vas",     label: "EQ VAS",             unit: "",  domain: [0, 100] },
]

const LINE_COLORS = [
  "#60a5fa", "#f87171", "#34d399", "#a78bfa",
  "#fb923c", "#facc15", "#38bdf8", "#f472b6",
  "#4ade80", "#c084fc", "#e879f9", "#fbbf24",
]

const AXIS_STYLE  = { fill: "#71717a", fontSize: 11 }
const GRID_COLOR  = "#27272a"
const TOOLTIP_STYLE = {
  backgroundColor: "#18181b", border: "1px solid #3f3f46",
  borderRadius: 8, color: "#e4e4e7", fontSize: 12,
}

/* ─── helpers ─── */

function getDimValues(row: PatientRow, dim: Dimension): string[] {
  return row[dim]
}

function collectDimOptions(patients: PatientRow[], dim: Dimension): { name: string; count: number }[] {
  const counts: Record<string, number> = {}
  for (const p of patients) {
    for (const v of getDimValues(p, dim)) {
      counts[v] = (counts[v] ?? 0) + 1
    }
  }
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100
}

/* ─── FilterSection: 접이식 차원 필터 ─── */

function FilterSection({
  dim,
  options,
  selected,
  onToggle,
  onSelectAll,
  onClearAll,
}: {
  dim: { key: Dimension; label: string }
  options: { name: string; color?: string }[]
  selected: Set<string>
  onToggle: (name: string) => void
  onSelectAll: () => void
  onClearAll: () => void
}) {
  const [open, setOpen] = useState(false)
  const activeCount = selected.size

  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-900">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-zinc-800/30 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2">
          <span className="text-zinc-300 text-sm font-medium">{dim.label}</span>
          {activeCount > 0 && (
            <span className="text-violet-400 text-xs font-medium bg-violet-500/15 px-1.5 py-0.5 rounded">
              {activeCount}개
            </span>
          )}
        </div>
        <span className={`text-zinc-500 text-xs transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      {open && (
        <div className="px-3 pb-2.5 pt-0.5">
          <div className="flex gap-2 mb-1.5">
            <button type="button" onClick={onSelectAll} className="text-xs text-blue-400 hover:text-blue-300">전체</button>
            <button type="button" onClick={onClearAll} className="text-xs text-zinc-500 hover:text-zinc-400">해제</button>
          </div>
          <div className="flex flex-wrap gap-1">
            {options.map(opt => {
              const active = selected.has(opt.name)
              return (
                <button
                  key={opt.name}
                  type="button"
                  onClick={() => onToggle(opt.name)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors border ${
                    active
                      ? "bg-violet-600/20 border-violet-500/50 text-violet-300"
                      : "bg-zinc-800/50 border-zinc-700/50 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-400"
                  }`}
                >
                  {opt.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── DimPicker: 결과 화면 내 필터/그룹 피커 ─── */

function DimPicker({
  dim, options, selected, onToggle, onSelectAll, onClearAll, isGroupBy,
}: {
  dim: { key: Dimension; label: string }
  options: { name: string; count: number }[]
  selected: Set<string>
  onToggle: (name: string) => void
  onSelectAll: () => void
  onClearAll: () => void
  isGroupBy: boolean
}) {
  const [open, setOpen] = useState(false)
  const activeCount = selected.size
  const badge = isGroupBy ? "비교 기준" : "필터"
  const accentClass = isGroupBy ? "text-blue-400" : "text-zinc-400"

  return (
    <div className={`border rounded-xl ${isGroupBy ? "border-blue-500/30 bg-blue-950/20" : "border-zinc-800 bg-zinc-900"}`}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-zinc-800/30 transition-colors rounded-xl"
      >
        <div className="flex items-center gap-2">
          <span className={`text-[10px] uppercase tracking-wide font-semibold ${accentClass}`}>{badge}</span>
          <span className="text-zinc-300 text-sm font-medium">{dim.label}</span>
          <span className="text-zinc-500 text-xs">
            {activeCount === 0 ? "전체" : `${activeCount}/${options.length}`}
          </span>
        </div>
        <span className={`text-zinc-500 text-xs transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      {open && (
        <div className="px-4 pb-3 pt-1">
          <div className="flex gap-2 mb-2">
            <button type="button" onClick={onSelectAll} className="text-xs text-blue-400 hover:text-blue-300">전체 선택</button>
            <button type="button" onClick={onClearAll} className="text-xs text-zinc-500 hover:text-zinc-400">전체 해제</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {options.map(opt => {
              const active = selected.has(opt.name)
              return (
                <button
                  key={opt.name}
                  type="button"
                  onClick={() => onToggle(opt.name)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    active
                      ? "bg-blue-600/20 border-blue-500/50 text-blue-300"
                      : "bg-zinc-800/50 border-zinc-700/50 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-400"
                  }`}
                >
                  <span className={`inline-block w-3 h-3 rounded border-2 shrink-0 ${
                    active ? "bg-blue-500 border-blue-500" : "border-zinc-600"
                  }`}>
                    {active && <svg viewBox="0 0 12 12" className="w-full h-full text-white" aria-hidden="true"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </span>
                  {opt.name}
                  <span className="text-zinc-600">({opt.count})</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── group computation (all metrics at once) ─── */

interface GroupData {
  name: string
  total: number
  metrics: Record<Metric, Record<string, { n: number; avg: number | null }>>
}

function computeGroups(
  patients: PatientRow[],
  groupByDim: Dimension,
  filters: Record<Dimension, Set<string>>,
  groupBySelected: Set<string>,
): GroupData[] {
  const filtered = patients.filter(p => {
    for (const dim of ALL_DIMENSIONS) {
      if (dim.key === groupByDim) continue
      const sel = filters[dim.key]
      if (sel.size === 0) continue
      const vals = getDimValues(p, dim.key)
      if (!vals.some(v => sel.has(v))) return false
    }
    return true
  })

  const groupMap: Record<string, PatientRow[]> = {}
  for (const p of filtered) {
    const keys = getDimValues(p, groupByDim)
    for (const k of keys) {
      if (groupBySelected.size > 0 && !groupBySelected.has(k)) continue
      if (!groupMap[k]) groupMap[k] = []
      groupMap[k].push(p)
    }
  }

  return Object.entries(groupMap)
    .map(([name, rows]) => {
      const metrics = {} as GroupData["metrics"]
      for (const m of METRIC_CHARTS) {
        const tps: Record<string, { n: number; avg: number | null }> = {}
        for (const tp of TIMEPOINTS) {
          const vals = rows
            .map(r => r.timepoints[tp]?.[m.key])
            .filter((v): v is number => v !== null && v !== undefined)
          tps[tp] = { n: vals.length, avg: avg(vals) }
        }
        metrics[m.key] = tps
      }
      return { name, total: rows.length, metrics }
    })
    .sort((a, b) => b.total - a.total)
}

/* ─── main component ─── */

type FilterSelections = Record<Dimension, Set<string>>

function emptySelections(): FilterSelections {
  return { op_category: new Set(), class_a: new Set(), class_b: new Set(), surgeon: new Set(), hospital: new Set() }
}

function buildQueryKey(sel: FilterSelections): string {
  return ALL_DIMENSIONS
    .map(d => {
      const vals = Array.from(sel[d.key]).sort()
      return vals.length > 0 ? `${d.key}=${vals.join(",")}` : ""
    })
    .filter(Boolean)
    .join("&")
}

function buildQueryParams(sel: FilterSelections): string {
  const parts: string[] = []
  for (const d of ALL_DIMENSIONS) {
    const vals = Array.from(sel[d.key])
    if (vals.length > 0) parts.push(`${d.key}=${encodeURIComponent(vals.join(","))}`)
  }
  return parts.join("&")
}

export function AnalyticsView() {
  // 조회 조건 (확정 전)
  const [preFilters, setPreFilters] = useState<FilterSelections>(emptySelections())
  // 확정된 조회 조건
  const [confirmedFilters, setConfirmedFilters] = useState<FilterSelections | null>(null)
  const [editing, setEditing] = useState(false)
  // 결과 화면 내 서브 필터
  const [groupByDim, setGroupByDim] = useState<Dimension>("class_b")
  const [subFilters, setSubFilters] = useState<FilterSelections>(emptySelections())

  const hasConfirmed = confirmedFilters !== null
  const queryKey = confirmedFilters ? buildQueryKey(confirmedFilters) : ""

  /* Step 1: DB 스키마에서 전체 차원 옵션 조회 */
  const { data: schema, isLoading: schemaLoading } = useQuery<DimensionSchema>({
    queryKey: ["analytics-schema"],
    queryFn: async () => {
      const res = await fetch("/api/notion/analytics/categories")
      if (!res.ok) throw new Error("스키마 조회 실패")
      return res.json()
    },
    staleTime: 60 * 60 * 1000,
  })

  /* Step 2: 조건 확정 후 환자 데이터 조회 */
  const { data, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ["analytics-rows", queryKey],
    queryFn: async () => {
      const params = buildQueryParams(confirmedFilters!)
      const res = await fetch(`/api/notion/analytics${params ? `?${params}` : ""}`)
      if (!res.ok) throw new Error("분석 데이터 조회 실패")
      return res.json()
    },
    enabled: hasConfirmed,
    staleTime: 5 * 60 * 1000,
  })

  function togglePreFilter(dim: Dimension, name: string) {
    setPreFilters(prev => {
      const next = new Set(prev[dim])
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return { ...prev, [dim]: next }
    })
  }

  const totalPreSelected = ALL_DIMENSIONS.reduce((sum, d) => sum + preFilters[d.key].size, 0)

  function confirmQuery() {
    if (totalPreSelected === 0) return
    setConfirmedFilters({ ...preFilters })
    setEditing(false)
    setSubFilters(emptySelections())
  }

  const patients = data?.patients ?? []

  const dimOptions = useMemo(() => {
    const result = {} as Record<Dimension, { name: string; count: number }[]>
    for (const dim of ALL_DIMENSIONS) {
      result[dim.key] = collectDimOptions(patients, dim.key)
    }
    return result
  }, [patients])

  function toggleSubFilter(dim: Dimension, name: string) {
    setSubFilters(prev => {
      const next = new Set(prev[dim])
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return { ...prev, [dim]: next }
    })
  }

  const groupBySelected = subFilters[groupByDim]

  const groups = useMemo(
    () => patients.length > 0 ? computeGroups(patients, groupByDim, subFilters, groupBySelected) : [],
    [patients, groupByDim, subFilters, groupBySelected]
  )

  const filteredPatientCount = useMemo(() => {
    return patients.filter(p => {
      for (const dim of ALL_DIMENSIONS) {
        if (dim.key === groupByDim) continue
        const sel = subFilters[dim.key]
        if (sel.size === 0) continue
        if (!getDimValues(p, dim.key).some(v => sel.has(v))) return false
      }
      return true
    }).length
  }, [patients, groupByDim, subFilters])

  const charts = useMemo(() => {
    return METRIC_CHARTS.map(m => {
      const hasData = groups.some(g =>
        TIMEPOINTS.some(tp => g.metrics[m.key]?.[tp]?.avg !== null && g.metrics[m.key]?.[tp]?.avg !== undefined)
      )
      const chartData = TIMEPOINTS.map(tp => {
        const row: Record<string, string | number | null> = { name: TIMEPOINT_LABELS[tp] }
        for (const g of groups) row[g.name] = g.metrics[m.key]?.[tp]?.avg ?? null
        return row
      })
      return { ...m, chartData, hasData }
    }).filter(c => c.hasData)
  }, [groups])

  // 확정된 필터 요약 텍스트
  const filterSummary = confirmedFilters
    ? ALL_DIMENSIONS
        .filter(d => confirmedFilters[d.key].size > 0)
        .map(d => `${d.label}: ${Array.from(confirmedFilters[d.key]).join(", ")}`)
        .join(" · ")
    : ""

  /* ─── 조건 선택 화면 ─── */
  const showFilterPicker = !hasConfirmed || editing

  if (showFilterPicker) {
    return (
      <div className="space-y-4">
        <p className="text-zinc-400 text-sm">
          {hasConfirmed ? "조회 조건을 변경하세요" : "조회 조건을 선택하세요 (복수 선택 가능)"}
        </p>
        {schemaLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-10 bg-zinc-800 rounded-lg" />
            ))}
          </div>
        ) : schema ? (
          <>
            <div className="space-y-1.5">
              {ALL_DIMENSIONS.map(dim => {
                const opts = schema[dim.key] ?? []
                if (opts.length === 0) return null
                return (
                  <FilterSection
                    key={dim.key}
                    dim={dim}
                    options={opts}
                    selected={preFilters[dim.key]}
                    onToggle={(name) => togglePreFilter(dim.key, name)}
                    onSelectAll={() => setPreFilters(prev => ({
                      ...prev,
                      [dim.key]: new Set(opts.map(o => o.name)),
                    }))}
                    onClearAll={() => setPreFilters(prev => ({ ...prev, [dim.key]: new Set() }))}
                  />
                )
              })}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmQuery}
                disabled={totalPreSelected === 0}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  totalPreSelected > 0
                    ? "bg-violet-600 hover:bg-violet-500 text-white"
                    : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                }`}
              >
                {totalPreSelected > 0 ? `조회 (${totalPreSelected}개 조건)` : "조건을 선택하세요"}
              </button>
              {hasConfirmed && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirmedFilters) setPreFilters({ ...confirmedFilters })
                    setEditing(false)
                  }}
                  className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-300 transition-colors"
                >
                  취소
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="text-zinc-600 text-sm text-center py-8">스키마를 불러올 수 없습니다.</p>
        )}
      </div>
    )
  }

  /* ─── 분석 결과 화면 ─── */
  return (
    <div className="space-y-4">
      {/* 헤더: 필터 요약 + 변경 버튼 + 환자수 */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-zinc-400 text-xs truncate">{filterSummary}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirmedFilters) setPreFilters({ ...confirmedFilters })
            setEditing(true)
          }}
          className="text-violet-400 hover:text-violet-300 text-xs transition-colors border border-violet-500/30 rounded-lg px-2 py-1 shrink-0"
        >
          조건 변경
        </button>
        {!isLoading && <span className="text-zinc-500 text-sm shrink-0">{patients.length}명</span>}
      </div>

      {/* 비교 기준 선택 */}
      <div>
        <p className="text-zinc-500 text-xs mb-1.5">비교 기준</p>
        <div className="flex flex-wrap gap-1.5">
          {ALL_DIMENSIONS.map(dim => (
            <button
              key={dim.key}
              type="button"
              onClick={() => setGroupByDim(dim.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                groupByDim === dim.key
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {dim.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-48 bg-zinc-800 rounded-xl" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-red-400 text-sm text-center py-8">
          데이터 로드 실패: {(error as Error).message}
        </p>
      )}

      {!isLoading && !error && patients.length > 0 && (
        <>
          {/* 서브 필터 (결과 내 세분화) */}
          <div className="space-y-2">
            {ALL_DIMENSIONS.map(dim => (
              <DimPicker
                key={dim.key}
                dim={dim}
                options={dimOptions[dim.key]}
                selected={subFilters[dim.key]}
                onToggle={(name) => toggleSubFilter(dim.key, name)}
                onSelectAll={() => setSubFilters(prev => ({
                  ...prev,
                  [dim.key]: new Set(dimOptions[dim.key].map(o => o.name)),
                }))}
                onClearAll={() => setSubFilters(prev => ({ ...prev, [dim.key]: new Set() }))}
                isGroupBy={dim.key === groupByDim}
              />
            ))}
          </div>

          <p className="text-zinc-600 text-xs">
            {patients.length}명 중 필터 적용: {filteredPatientCount}명
            {groupBySelected.size > 0 && ` · 비교 선택: ${groupBySelected.size}개`}
          </p>

          {groups.length > 0 ? (
            <>
              {/* 그룹 범례 */}
              <div className="flex flex-wrap gap-2">
                {groups.map((g, i) => (
                  <div key={g.name} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }} />
                    <span className="text-zinc-300 text-xs font-medium">{g.name}</span>
                    <span className="text-zinc-500 text-xs">{g.total}명</span>
                  </div>
                ))}
              </div>

              {/* 전체 PROM 차트 — 반응형 그리드 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {charts.map(chart => (
                  <div key={chart.key} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                    <p className="text-zinc-400 text-xs font-medium uppercase tracking-wide mb-2">
                      {chart.label}
                    </p>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={chart.chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                        <XAxis dataKey="name" tick={AXIS_STYLE} />
                        <YAxis
                          domain={chart.domain}
                          tick={AXIS_STYLE}
                          unit={chart.unit}
                          width={chart.unit === "%" ? 36 : 28}
                        />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        {groups.length > 1 && (
                          <Legend wrapperStyle={{ fontSize: 9, color: "#a1a1aa" }} />
                        )}
                        {groups.map((g, i) => (
                          <Line
                            key={g.name}
                            type="monotone"
                            dataKey={g.name}
                            stroke={LINE_COLORS[i % LINE_COLORS.length]}
                            strokeWidth={2}
                            dot={{ r: 2.5, fill: LINE_COLORS[i % LINE_COLORS.length] }}
                            connectNulls={false}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-zinc-600 text-sm text-center py-8">
              비교 기준을 선택하거나 필터를 조정하세요.
            </p>
          )}

          {data?.fetchedAt && (
            <p className="text-zinc-700 text-xs text-right">
              조회: {new Date(data.fetchedAt).toLocaleString("ko-KR")} · 5분 캐시
            </p>
          )}
        </>
      )}

      {!isLoading && !error && patients.length === 0 && hasConfirmed && (
        <p className="text-zinc-600 text-sm text-center py-8">
          해당 조건에 환자 데이터가 없습니다.
        </p>
      )}
    </div>
  )
}
