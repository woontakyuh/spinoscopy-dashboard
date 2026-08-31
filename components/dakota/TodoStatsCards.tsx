"use client"

import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from "recharts"
import type { TodoItem } from "@/lib/notion/todo"
import { chartTooltipLabelStyle, chartTooltipStyle, useChartTokens } from "./charts/useChartTokens"

interface TodoStatsProps {
  activeTodos: TodoItem[]
  doneTodos: TodoItem[]
}

export function completionDateKey(completedAt: string | null): string | null {
  if (!completedAt) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(completedAt)) return completedAt
  const date = new Date(completedAt)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

function getWeeklyData(doneTodos: TodoItem[]): { day: string; count: number }[] {
  const days: { day: string; count: number }[] = []
  const now = new Date()

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
    const label = d.toLocaleDateString("ko-KR", { weekday: "short", timeZone: "Asia/Seoul" })
    const count = doneTodos.filter((t) => completionDateKey(t.completed_at ?? t.created_at) === key).length
    days.push({ day: label, count })
  }

  return days
}

/** 완료 막대 색 — dataviz 검증 결과 green-400(#4ade80)은 라이트 표면 대비 1.7:1로 WARN이라
 * green-600(#16a34a)으로 교체했다. 라이트/다크 표면 모두 3:1 이상 통과. */
const DONE_BAR_COLOR = "#16a34a"

export function TodoStatsCards({ activeTodos, doneTodos }: TodoStatsProps) {
  const tokens = useChartTokens()
  const activeCount = activeTodos.length
  const doneCount = doneTodos.length
  const total = activeCount + doneCount
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0

  const weeklyData = getWeeklyData(doneTodos)
  const weekTotal = weeklyData.reduce((s, d) => s + d.count, 0)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* 완료율 */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">완료율</span>
          <span className="text-sm text-foreground/90 num">
            <span className="text-green-700 dark:text-green-400 font-medium">{doneCount}</span>
            <span className="text-muted-foreground"> / {total}건</span>
            <span className="text-muted-foreground ml-1.5 font-semibold">{pct}%</span>
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-green-600 to-emerald-500 dark:from-green-500 dark:to-emerald-400 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span>할 일 {activeCount}건</span>
          <span>한 일 {doneCount}건</span>
        </div>
      </div>

      {/* 주간 완료 트렌드 */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">주간 완료</span>
          <span className="text-sm text-foreground/90">{weekTotal}건</span>
        </div>
        <ResponsiveContainer width="100%" height={60}>
          <BarChart data={weeklyData} barCategoryGap="20%">
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fill: tokens.mutedText, fontSize: 10 }}
            />
            <Tooltip
              contentStyle={chartTooltipStyle(tokens)}
              labelStyle={chartTooltipLabelStyle(tokens)}
              itemStyle={{ color: DONE_BAR_COLOR }}
              formatter={(value) => [`${value}건`, "완료"]}
            />
            <Bar dataKey="count" fill={DONE_BAR_COLOR} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
