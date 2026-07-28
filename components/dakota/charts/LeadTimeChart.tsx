"use client"

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { LeadTimeRow } from "@/lib/dakota-ledger/stats"
import { DOMAIN_CHART_COLOR, DOMAIN_LABEL } from "../operationLabels"
import { ChartEmpty, ChartPanel } from "./ChartPanel"
import { chartTooltipLabelStyle, chartTooltipStyle, useChartTokens } from "./useChartTokens"

function domainColor(domain: string): string {
  return DOMAIN_CHART_COLOR[domain] ?? DOMAIN_CHART_COLOR.Training
}

export function LeadTimeChart({ rows }: { rows: LeadTimeRow[] }) {
  const tokens = useChartTokens()

  return (
    <ChartPanel title="리드타임" subtitle="도메인별 착수 ~ 완료 중앙값 (일)">
      {rows.length === 0 ? (
        <ChartEmpty message="이 기간에 완료된 과제가 없습니다." />
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 34)}>
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={tokens.grid} strokeDasharray="0" horizontal={false} />
            <XAxis type="number" allowDecimals tick={{ fill: tokens.mutedText, fontSize: 10 }} axisLine={{ stroke: tokens.grid }} tickLine={false} unit="일" />
            <YAxis
              type="category"
              dataKey="domain"
              tickFormatter={(domain: string) => DOMAIN_LABEL[domain] ?? domain}
              tick={{ fill: tokens.mutedText, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <Tooltip
              contentStyle={chartTooltipStyle(tokens)}
              labelStyle={chartTooltipLabelStyle(tokens)}
              formatter={(value, _name, entry) => {
                const payload = entry.payload as LeadTimeRow
                return [`${value ?? 0}일 (완료 ${payload.count}건)`, "중앙값"]
              }}
              labelFormatter={(domain) => DOMAIN_LABEL[String(domain)] ?? String(domain)}
            />
            <Bar dataKey="medianDays" isAnimationActive={false} barSize={16}>
              {rows.map((row) => (
                <Cell key={row.domain} fill={domainColor(row.domain)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartPanel>
  )
}
