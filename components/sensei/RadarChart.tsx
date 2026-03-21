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
}

export function RadarChart({ attributes, compareAttributes, compareName }: RadarChartProps) {
  const data = (Object.keys(ATTR_LABELS) as (keyof BjjAttributes)[]).map((key) => ({
    subject: ATTR_LABELS[key],
    me: attributes[key],
    ...(compareAttributes ? { compare: compareAttributes[key] } : {}),
  }))

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RechartsRadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
        <PolarGrid stroke="#3f3f46" />
        <PolarAngleAxis
          dataKey="subject"
          tick={{ fill: "#a1a1aa", fontSize: 11 }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 100]}
          tick={{ fill: "#52525b", fontSize: 9 }}
          tickCount={6}
        />
        <Radar
          name="Me"
          dataKey="me"
          stroke="#f97316"
          fill="#f97316"
          fillOpacity={0.25}
          strokeWidth={2}
        />
        {compareAttributes && (
          <Radar
            name={compareName || "Compare"}
            dataKey="compare"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.1}
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
        )}
        {compareAttributes && <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />}
      </RechartsRadarChart>
    </ResponsiveContainer>
  )
}
