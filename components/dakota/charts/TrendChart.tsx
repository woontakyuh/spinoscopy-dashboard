"use client"

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { TrendBucketRow } from "@/lib/dakota-ledger/stats"
import { DOMAIN_CHART_COLOR, DOMAIN_LABEL } from "../operationLabels"
import { ChartEmpty, ChartPanel } from "./ChartPanel"
import { chartTooltipLabelStyle, chartTooltipStyle, useChartTokens } from "./useChartTokens"

function domainColor(domain: string): string {
  return DOMAIN_CHART_COLOR[domain] ?? DOMAIN_CHART_COLOR.Training
}

const BUCKET_LABEL: Record<string, string> = { hour: "시간대", day: "일", week: "주", month: "월" }

export function TrendChart({
  rows,
  domains,
  granularity,
}: {
  rows: TrendBucketRow[]
  domains: string[]
  granularity: "hour" | "day" | "week" | "month"
}) {
  const hasData = rows.some((r) => r.total > 0)
  const tokens = useChartTokens()

  return (
    <ChartPanel title="추세" subtitle={`${BUCKET_LABEL[granularity]} 단위, 도메인별 세션 수`}>
      {!hasData ? (
        <ChartEmpty message="이 기간에 표시할 세션이 없습니다." />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={rows} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barCategoryGap={2}>
            <CartesianGrid stroke={tokens.grid} strokeDasharray="0" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: tokens.mutedText, fontSize: 10 }} axisLine={{ stroke: tokens.grid }} tickLine={false} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fill: tokens.mutedText, fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              contentStyle={chartTooltipStyle(tokens)}
              labelStyle={chartTooltipLabelStyle(tokens)}
              formatter={(value, name) => [value ?? 0, DOMAIN_LABEL[String(name)] ?? String(name)]}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, color: tokens.mutedText }}
              formatter={(value: string) => DOMAIN_LABEL[value] ?? value}
            />
            {domains.map((domain) => (
              <Bar key={domain} dataKey={`byDomain.${domain}`} name={domain} stackId="trend" fill={domainColor(domain)} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartPanel>
  )
}
