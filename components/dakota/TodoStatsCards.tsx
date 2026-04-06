"use client"

import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from "recharts"
import type { TodoItem } from "@/lib/notion/todo"

interface TodoStatsProps {
  activeTodos: TodoItem[]
  doneTodos: TodoItem[]
}

function getWeeklyData(doneTodos: TodoItem[]): { day: string; count: number }[] {
  const days: { day: string; count: number }[] = []
  const now = new Date()

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
    const label = d.toLocaleDateString("ko-KR", { weekday: "short", timeZone: "Asia/Seoul" })
    const count = doneTodos.filter((t) => t.completed_at === key).length
    days.push({ day: label, count })
  }

  return days
}

export function TodoStatsCards({ activeTodos, doneTodos }: TodoStatsProps) {
  const activeCount = activeTodos.length
  const doneCount = doneTodos.length
  const total = activeCount + doneCount
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0

  const weeklyData = getWeeklyData(doneTodos)
  const weekTotal = weeklyData.reduce((s, d) => s + d.count, 0)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* 완료율 */}
      <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">완료율</span>
          <span className="text-sm text-zinc-300 num">
            <span className="text-green-400 font-medium">{doneCount}</span>
            <span className="text-zinc-500"> / {total}건</span>
            <span className="text-zinc-400 ml-1.5 font-semibold">{pct}%</span>
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-zinc-500">
          <span>할 일 {activeCount}건</span>
          <span>한 일 {doneCount}건</span>
        </div>
      </div>

      {/* 주간 완료 트렌드 */}
      <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">주간 완료</span>
          <span className="text-sm text-zinc-300">{weekTotal}건</span>
        </div>
        <ResponsiveContainer width="100%" height={60}>
          <BarChart data={weeklyData} barCategoryGap="20%">
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#71717a", fontSize: 10 }}
            />
            <Tooltip
              contentStyle={{ background: "#27272a", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#a1a1aa" }}
              itemStyle={{ color: "#4ade80" }}
              formatter={(value) => [`${value}건`, "완료"]}
            />
            <Bar dataKey="count" fill="#4ade80" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
