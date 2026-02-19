"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import type { AnalyticsResult, GroupResult, GroupBy } from "@/lib/notion/analytics"

const TIMEPOINT_LABELS: Record<string, string> = {
  pre: "수술 전", "1mo": "1개월", "3mo": "3개월", "6mo": "6개월", "1y": "1년",
}
const TIMEPOINTS = ["pre", "1mo", "3mo", "6mo", "1y"]

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "op_category", label: "수술 종류" },
  { value: "class_a",     label: "질환 분류 (ClassA)" },
  { value: "class_b",     label: "세부 진단 (ClassB)" },
]

type Metric = "vas_prox" | "vas_dist" | "odi" | "ndi" | "joa" | "eq5d_utility" | "eq5d_vas"

const METRIC_OPTIONS: { value: Metric; label: string; unit: string; domain: [number, number] }[] = [
  { value: "vas_prox",     label: "VAS ① (Neck/Back)",  unit: "",   domain: [0, 10] },
  { value: "vas_dist",     label: "VAS ② (Arm/Leg)",    unit: "",   domain: [0, 10] },
  { value: "ndi",          label: "NDI %",               unit: "%",  domain: [0, 100] },
  { value: "odi",          label: "ODI %",               unit: "%",  domain: [0, 100] },
  { value: "joa",          label: "JOA",                 unit: "",   domain: [0, 17] },
  { value: "eq5d_utility", label: "EQ-5D utility",       unit: "",   domain: [0, 1] },
  { value: "eq5d_vas",     label: "EQ VAS",              unit: "",   domain: [0, 100] },
]

const LINE_COLORS = [
  "#60a5fa", "#f87171", "#34d399", "#a78bfa",
  "#fb923c", "#facc15", "#38bdf8", "#f472b6",
  "#4ade80", "#c084fc",
]

const AXIS_STYLE  = { fill: "#71717a", fontSize: 11 }
const GRID_COLOR  = "#27272a"
const TOOLTIP_STYLE = {
  backgroundColor: "#18181b", border: "1px solid #3f3f46",
  borderRadius: 8, color: "#e4e4e7", fontSize: 12,
}

function buildChartData(groups: GroupResult[], metric: Metric) {
  return TIMEPOINTS.map(tp => {
    const row: Record<string, string | number | null> = { name: TIMEPOINT_LABELS[tp] }
    for (const g of groups) {
      const val = g.timepoints[tp]?.[metric] ?? null
      row[g.name] = val
    }
    return row
  })
}

function SummaryTable({ groups, metric }: { groups: GroupResult[]; metric: Metric }) {
  const metaLabel = METRIC_OPTIONS.find(m => m.value === metric)?.label ?? metric
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs text-zinc-400 border-collapse">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="text-left py-2 pr-4 font-medium text-zinc-300">그룹</th>
            <th className="text-center py-2 px-2 font-medium text-zinc-300">N</th>
            {TIMEPOINTS.map(tp => (
              <th key={tp} className="text-center py-2 px-2 font-medium text-zinc-300">
                {TIMEPOINT_LABELS[tp]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g, i) => (
            <tr key={g.name} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
              <td className="py-2 pr-4">
                <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }} />
                {g.name}
              </td>
              <td className="text-center py-2 px-2 text-zinc-500">{g.total}</td>
              {TIMEPOINTS.map(tp => {
                const val = g.timepoints[tp]?.[metric]
                const n   = g.timepoints[tp]?.n ?? 0
                return (
                  <td key={tp} className="text-center py-2 px-2">
                    {val !== null && val !== undefined ? (
                      <span className="text-white font-medium">
                        {typeof val === "number" && val < 2 ? val.toFixed(3) : val.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-zinc-700">—</span>
                    )}
                    {n > 0 && <span className="text-zinc-600 ml-1">({n})</span>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AnalyticsView() {
  const [groupBy, setGroupBy] = useState<GroupBy>("op_category")
  const [metric, setMetric]   = useState<Metric>("vas_prox")
  const [minN, setMinN]       = useState(3)

  const { data, isLoading, error } = useQuery<AnalyticsResult>({
    queryKey: ["analytics", groupBy],
    queryFn: async () => {
      const res = await fetch(`/api/notion/analytics?groupBy=${groupBy}`)
      if (!res.ok) throw new Error("분석 데이터 조회 실패")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const filteredGroups = (data?.groups ?? []).filter(g => g.total >= minN)
  const metaInfo = METRIC_OPTIONS.find(m => m.value === metric)!
  const chartData = buildChartData(filteredGroups, metric)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <p className="text-zinc-500 text-xs mb-1.5">그룹 기준</p>
          <div className="flex gap-1.5">
            {GROUP_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setGroupBy(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  groupBy === opt.value
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-zinc-500 text-xs mb-1.5">지표</p>
          <div className="flex flex-wrap gap-1.5">
            {METRIC_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMetric(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  metric === opt.value
                    ? "bg-violet-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-zinc-500 text-xs mb-1.5">최소 N</p>
          <div className="flex gap-1.5">
            {[1, 3, 5, 10].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setMinN(n)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  minN === n
                    ? "bg-zinc-600 text-white"
                    : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700"
                }`}
              >
                ≥{n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-64 w-full bg-zinc-800" />
          <Skeleton className="h-32 w-full bg-zinc-800" />
        </div>
      )}

      {error && (
        <p className="text-red-400 text-sm text-center py-8">
          데이터 로드 실패: {(error as Error).message}
        </p>
      )}

      {!isLoading && !error && filteredGroups.length === 0 && (
        <p className="text-zinc-600 text-sm text-center py-8">
          조건에 맞는 그룹이 없습니다.
        </p>
      )}

      {!isLoading && filteredGroups.length > 0 && (
        <>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-zinc-300 text-sm font-medium">
                {metaInfo.label} — 시점별 평균
              </p>
              <p className="text-zinc-600 text-xs">
                {filteredGroups.length}개 그룹 · 전체 {data?.groups.reduce((s, g) => s + g.total, 0)}명
              </p>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                <XAxis dataKey="name" tick={AXIS_STYLE} />
                <YAxis
                  domain={metaInfo.domain}
                  tick={AXIS_STYLE}
                  unit={metaInfo.unit}
                  width={metaInfo.unit === "%" ? 40 : 32}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />
                {filteredGroups.map((g, i) => (
                  <Line
                    key={g.name}
                    type="monotone"
                    dataKey={g.name}
                    stroke={LINE_COLORS[i % LINE_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 4, fill: LINE_COLORS[i % LINE_COLORS.length] }}
                    connectNulls={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-zinc-300 text-sm font-medium mb-3">
              요약 테이블 <span className="text-zinc-600 font-normal text-xs ml-1">(괄호 = 데이터 있는 환자 수)</span>
            </p>
            <SummaryTable groups={filteredGroups} metric={metric} />
          </div>

          {data?.fetchedAt && (
            <p className="text-zinc-700 text-xs text-right">
              조회: {new Date(data.fetchedAt).toLocaleString("ko-KR")} · 5분 캐시
            </p>
          )}
        </>
      )}
    </div>
  )
}
