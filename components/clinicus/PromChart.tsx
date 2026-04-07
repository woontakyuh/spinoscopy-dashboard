"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"
import {
  parseVAS,
  parseODI,
  parseNDI,
  parseJOA,
  parseEQ5D,
  inferRegion,
} from "@/lib/prom/calculator"

const TIMEPOINTS = [
  { key: "pre",  label: "수술 전", month: 0 },
  { key: "1mo",  label: "1개월",   month: 1 },
  { key: "3mo",  label: "3개월",   month: 3 },
  { key: "6mo",  label: "6개월",   month: 6 },
  { key: "1y",   label: "1년",    month: 12 },
]

const MONTH_TICKS = [0, 1, 3, 6, 12]
const MONTH_LABELS: Record<number, string> = { 0: "수술 전", 1: "1개월", 3: "3개월", 6: "6개월", 12: "1년" }
const formatMonth = (v: number) => MONTH_LABELS[v] ?? `${v}mo`

const CHART_STYLE = {
  background: "transparent",
  fontSize: 11,
}

const AXIS_STYLE = { fill: "#71717a", fontSize: 11 }
const GRID_COLOR = "#27272a"
const TOOLTIP_STYLE = {
  backgroundColor: "#18181b",
  border: "1px solid #3f3f46",
  borderRadius: 8,
  color: "#e4e4e7",
  fontSize: 12,
}

interface ChartCardProps {
  title: string
  children: React.ReactNode
}

function ChartCard({ title, children }: ChartCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-3">{title}</p>
      {children}
    </div>
  )
}

interface Props {
  promRecord: Record<string, string>
}

export function PromChart({ promRecord }: Props) {
  const region = inferRegion(promRecord)
  const proxLabel = region === "cervical" ? "Neck VAS" : region === "lumbar" ? "Back VAS" : "VAS ①"
  const distLabel = region === "cervical" ? "Arm VAS"  : region === "lumbar" ? "Leg VAS"  : "VAS ②"
  const disabilityLabel = region === "cervical" ? "NDI %" : region === "lumbar" ? "ODI %" : "NDI/ODI %"

  const vasData = TIMEPOINTS.map(tp => {
    const raw = promRecord[`${tp.key} VAS`] ?? ""
    const v = raw ? parseVAS(raw) : null
    return {
      month: tp.month,
      [proxLabel]: v?.proximal ?? null,
      [distLabel]: v?.distal ?? null,
    }
  })

  const disabilityData = TIMEPOINTS.map(tp => {
    const odiRaw = promRecord[`${tp.key} ODI`] ?? ""
    const ndiRaw = promRecord[`${tp.key} NDI`] ?? ""
    const odi = odiRaw ? parseODI(odiRaw) : null
    const ndi = ndiRaw ? parseNDI(ndiRaw) : null
    const score = odi?.score ?? ndi?.score ?? null
    return { month: tp.month, [disabilityLabel]: score !== null ? Math.round(score * 10) / 10 : null }
  })

  const joaData = TIMEPOINTS.map(tp => {
    const raw = promRecord[`${tp.key} JOA`] ?? ""
    const v = raw ? parseJOA(raw) : null
    return { month: tp.month, JOA: v }
  })

  const eq5dData = TIMEPOINTS.map(tp => {
    const raw = promRecord[`${tp.key} EQ5D`] ?? ""
    const v = raw ? parseEQ5D(raw) : null
    return {
      month: tp.month,
      "EQ-5D utility": v?.utility ?? null,
      "EQ VAS": v?.vas ?? null,
    }
  })

  const hasVAS       = vasData.some(d => d[proxLabel] !== null || d[distLabel] !== null)
  const hasDisab     = disabilityData.some(d => d[disabilityLabel] !== null)
  const hasJOA       = joaData.some(d => d.JOA !== null)
  const hasEQ5D      = eq5dData.some(d => d["EQ-5D utility"] !== null)

  if (!hasVAS && !hasDisab && !hasJOA && !hasEQ5D) {
    return (
      <p className="text-muted-foreground/70 text-sm italic text-center py-6">
        그래프를 그릴 데이터가 없습니다.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

      {hasVAS && (
        <ChartCard title="VAS (통증)">
          <ResponsiveContainer width="100%" height={180} style={CHART_STYLE}>
            <LineChart data={vasData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis type="number" dataKey="month" domain={[0, 12]} ticks={MONTH_TICKS} tickFormatter={formatMonth} tick={AXIS_STYLE} />
              <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={AXIS_STYLE} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />
              <Line
                type="monotone"
                dataKey={proxLabel}
                stroke="#60a5fa"
                strokeWidth={2}
                dot={{ r: 4, fill: "#60a5fa" }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey={distLabel}
                stroke="#f87171"
                strokeWidth={2}
                dot={{ r: 4, fill: "#f87171" }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {hasDisab && (
        <ChartCard title={disabilityLabel + " (장애 지수)"}> 
          <ResponsiveContainer width="100%" height={180} style={CHART_STYLE}>
            <LineChart data={disabilityData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis type="number" dataKey="month" domain={[0, 12]} ticks={MONTH_TICKS} tickFormatter={formatMonth} tick={AXIS_STYLE} />
              <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={AXIS_STYLE} unit="%" />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}%`, disabilityLabel]} />
              <ReferenceLine y={40} stroke="#52525b" strokeDasharray="4 4" label={{ value: "중증", fill: "#71717a", fontSize: 10 }} />
              <Line
                type="monotone"
                dataKey={disabilityLabel}
                stroke="#34d399"
                strokeWidth={2}
                dot={{ r: 4, fill: "#34d399" }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {hasJOA && (
        <ChartCard title="JOA (신경 기능)">
          <ResponsiveContainer width="100%" height={180} style={CHART_STYLE}>
            <LineChart data={joaData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis type="number" dataKey="month" domain={[0, 12]} ticks={MONTH_TICKS} tickFormatter={formatMonth} tick={AXIS_STYLE} />
              <YAxis domain={[0, 17]} ticks={[0, 4, 8, 12, 17]} tick={AXIS_STYLE} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <ReferenceLine y={17} stroke="#52525b" strokeDasharray="4 4" label={{ value: "만점", fill: "#71717a", fontSize: 10 }} />
              <Line
                type="monotone"
                dataKey="JOA"
                stroke="#a78bfa"
                strokeWidth={2}
                dot={{ r: 4, fill: "#a78bfa" }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {hasEQ5D && (
        <ChartCard title="EQ-5D (삶의 질)">
          <ResponsiveContainer width="100%" height={180} style={CHART_STYLE}>
            <LineChart data={eq5dData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis type="number" dataKey="month" domain={[0, 12]} ticks={MONTH_TICKS} tickFormatter={formatMonth} tick={AXIS_STYLE} />
              <YAxis
                yAxisId="utility"
                domain={[0, 1]}
                ticks={[0, 0.25, 0.5, 0.75, 1]}
                tick={AXIS_STYLE}
                width={36}
              />
              <YAxis
                yAxisId="vas"
                orientation="right"
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tick={AXIS_STYLE}
                width={32}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />
              <Line
                yAxisId="utility"
                type="monotone"
                dataKey="EQ-5D utility"
                stroke="#fb923c"
                strokeWidth={2}
                dot={{ r: 4, fill: "#fb923c" }}
                connectNulls
              />
              <Line
                yAxisId="vas"
                type="monotone"
                dataKey="EQ VAS"
                stroke="#facc15"
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={{ r: 4, fill: "#facc15" }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

    </div>
  )
}
