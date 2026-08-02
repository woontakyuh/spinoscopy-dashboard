"use client"

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ChartPanel } from "./ChartPanel"
import { chartTooltipLabelStyle, chartTooltipStyle, useChartTokens } from "./useChartTokens"

export interface WikiEventChartRow {
  label: string
  created: number
  updated: number
  deleted: number
}

/**
 * created/updated/deleted는 각자 뚜렷한 valence(생성=좋음, 갱신=중립, 삭제=손실)를 가져서
 * 새 카테고리 팔레트를 고르는 대신 operationLabels.ts의 DOMAIN_CHART_COLOR에서 이미
 * dataviz 검증(라이트/다크 모두 ALL CHECKS PASS)을 통과한 슬롯을 그대로 재사용한다
 * (Family #008300 초록 / Strategy #3987e5 파랑 / Operations #e66767 빨강).
 */
const CREATED_COLOR = "#008300"
const UPDATED_COLOR = "#3987e5"
const DELETED_COLOR = "#e66767"

export function WikiEventsChart({ rows }: { rows: WikiEventChartRow[] }) {
  const tokens = useChartTokens()

  return (
    <ChartPanel title="컴파일 이벤트" subtitle="이벤트별 생성/갱신/삭제 페이지 수">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={rows} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barCategoryGap={4}>
          <CartesianGrid stroke={tokens.grid} strokeDasharray="0" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: tokens.mutedText, fontSize: 10 }} axisLine={{ stroke: tokens.grid }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: tokens.mutedText, fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
          <Tooltip contentStyle={chartTooltipStyle(tokens)} labelStyle={chartTooltipLabelStyle(tokens)} />
          <Legend wrapperStyle={{ fontSize: 11, color: tokens.mutedText }} />
          <Bar dataKey="created" name="생성" fill={CREATED_COLOR} isAnimationActive={false} />
          <Bar dataKey="updated" name="갱신" fill={UPDATED_COLOR} isAnimationActive={false} />
          <Bar dataKey="deleted" name="삭제" fill={DELETED_COLOR} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartPanel>
  )
}
