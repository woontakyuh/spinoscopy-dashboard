"use client"

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts"
import type { Archetype, BjjAttributes } from "@/lib/types/sensei"
import { STAT_BARS, type RadarDatum } from "./statConfig"

interface AttributePanelProps {
  attrs: BjjAttributes
  belt: { cap: number; hex: string }
  radarData: RadarDatum[]
  activeCompare: Archetype | null
  closestArch: { arch: Archetype; similarity: number } | null
}

/** 능력치 레이더 + 6축 게이지 (비교 오버레이 포함) */
export function AttributePanel({ attrs, belt, radarData, activeCompare, closestArch }: AttributePanelProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* 레이더 (비교 오버레이) */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[10px] font-medium text-muted-foreground">능력치 레이더</h3>
          {activeCompare && <span className="text-[9px] text-muted-foreground">vs {activeCompare.name}</span>}
        </div>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="68%" data={radarData}>
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar name="Cap" dataKey="cap" stroke={belt.hex} strokeWidth={1} strokeDasharray="4 3" fill="none" />
              <Radar name="Me" dataKey="value" stroke="#f97316" strokeWidth={2} fill="#f97316" fillOpacity={0.2} />
              {activeCompare && (
                <Radar name={activeCompare.name} dataKey="compare" stroke="#f87171" strokeWidth={1.5} fill="none" strokeDasharray="5 3" />
              )}
            </RadarChart>
          </ResponsiveContainer>
        </div>
        {closestArch && (
          <p className="text-[10px] text-muted-foreground text-center">
            {closestArch.arch.flag} {closestArch.arch.name} — {closestArch.similarity}% match
          </p>
        )}
      </div>

      {/* 6축 바 (비교 마커 포함) */}
      <div>
        <h3 className="text-[10px] font-medium text-muted-foreground mb-2">능력치</h3>
        <div className="space-y-1.5" data-testid="attribute-gauges">
          {STAT_BARS.map((s) => {
            const compVal = activeCompare?.stats[s.key]
            const value = attrs[s.key]
            return (
              <div
                key={s.name}
                data-testid={`attr-gauge-${s.key}`}
                role="meter"
                aria-label={`${s.name} ${value} / 100`}
                aria-valuenow={value}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="flex justify-between text-[11px] mb-0.5">
                  <span className="text-muted-foreground">{s.name}</span>
                  <span className="num font-semibold text-foreground">{value}</span>
                </div>
                <div className="relative w-full h-1.5 bg-muted rounded-full overflow-visible">
                  <div className={`h-full ${s.color} rounded-full`} style={{ width: `${value}%` }} />
                  <div className="absolute top-0 h-full w-px" style={{ left: `${belt.cap}%`, background: belt.hex, opacity: 0.4 }} />
                  {compVal !== undefined && (
                    <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 rounded-full bg-foreground/40" style={{ left: `${compVal}%` }} title={`${activeCompare?.name}: ${compVal}`} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
