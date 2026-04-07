"use client"

import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
} from "recharts"
import type { BjjAttributes } from "@/lib/types/sensei"

const ATTR_LABELS: Record<keyof BjjAttributes, string> = {
  guard: "Guard",
  passing: "Passing",
  control: "Control",
  finishing: "Finishing",
  takedowns: "Takedowns",
  legLocks: "Leg Locks",
}

interface RadarChartProps {
  attributes: BjjAttributes
  compareAttributes?: BjjAttributes | null
  compareName?: string
  maxDomain?: number
}

export function RadarChart({ attributes, compareAttributes, compareName, maxDomain = 40 }: RadarChartProps) {
  const data = (Object.keys(ATTR_LABELS) as (keyof BjjAttributes)[]).map((key) => ({
    subject: ATTR_LABELS[key],
    me: attributes[key],
    ...(compareAttributes ? { compare: compareAttributes[key] } : {}),
  }))

  return (
    <ResponsiveContainer width="100%" height={250}>
      <RechartsRadarChart data={data} cx="50%" cy="50%" outerRadius="72%">
        <PolarGrid stroke="rgba(255,255,255,0.06)" />
        <PolarAngleAxis
          dataKey="subject"
          tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, maxDomain]}
          tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 9 }}
          tickCount={5}
        />
        <Radar
          name="Me"
          dataKey="me"
          stroke="#3b82f6"
          fill="#3b82f6"
          fillOpacity={0.15}
          strokeWidth={1.5}
        />
        {compareAttributes && (
          <Radar
            name={compareName || "Compare"}
            dataKey="compare"
            stroke="rgba(255,255,255,0.25)"
            fill="rgba(255,255,255,0.05)"
            fillOpacity={0.05}
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        )}
        {compareAttributes && (
          <Legend
            wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
          />
        )}
      </RechartsRadarChart>
    </ResponsiveContainer>
  )
}
