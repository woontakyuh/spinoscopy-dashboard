"use client"

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import type { DomainShareSlice } from "@/lib/dakota-ledger/stats"
import { DOMAIN_CHART_COLOR, DOMAIN_LABEL } from "../operationLabels"
import { ChartEmpty, ChartPanel } from "./ChartPanel"
import { chartTooltipLabelStyle, chartTooltipStyle, useChartTokens } from "./useChartTokens"

function domainColor(domain: string): string {
  return DOMAIN_CHART_COLOR[domain] ?? DOMAIN_CHART_COLOR.Training
}

export function DomainShareChart({ shares }: { shares: DomainShareSlice[] }) {
  const total = shares.reduce((sum, s) => sum + s.count, 0)
  const tokens = useChartTokens()

  return (
    <ChartPanel title="비중" subtitle="선택한 기간의 도메인별 세션 점유율">
      {shares.length === 0 ? (
        <ChartEmpty message="이 기간에 세션이 없습니다." />
      ) : (
        <div>
          <div className="relative">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={shares}
                  dataKey="count"
                  nameKey="domain"
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={86}
                  paddingAngle={2}
                  stroke={tokens.surface}
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {shares.map((slice) => (
                    <Cell key={slice.domain} fill={domainColor(slice.domain)} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={chartTooltipStyle(tokens)}
                  labelStyle={chartTooltipLabelStyle(tokens)}
                  formatter={(value, _name, entry) => {
                    const payload = entry.payload as DomainShareSlice
                    return [`${value ?? 0} (${Math.round(payload.pct * 100)}%)`, DOMAIN_LABEL[payload.domain] ?? payload.domain]
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-semibold text-foreground">{total}</span>
              <span className="text-[10px] text-muted-foreground">세션</span>
            </div>
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {shares.map((s) => (
              <li key={s.domain} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 shrink-0" style={{ backgroundColor: domainColor(s.domain) }} />
                {DOMAIN_LABEL[s.domain] ?? s.domain} {Math.round(s.pct * 100)}%
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartPanel>
  )
}
