"use client"

import { useMemo } from "react"
import type { SenseiEntry } from "@/lib/types/sensei"

const WEEK_COUNT = 26
const DAYS_PER_WEEK = 7

function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function physicalSessionCount(entries: readonly SenseiEntry[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    if (!entry.date || (entry.sessionType !== "class" && entry.sessionType !== "openmat")) continue
    counts.set(entry.date, (counts.get(entry.date) ?? 0) + 1)
  }
  return counts
}

function levelClass(count: number, isFuture: boolean): string {
  if (isFuture) return "border-border/30 bg-muted/15"
  if (count >= 3) return "border-orange-300/70 bg-orange-400"
  if (count === 2) return "border-orange-500/60 bg-orange-500/75"
  if (count === 1) return "border-orange-400/60 bg-orange-600/80"
  return "border-border/60 bg-muted/55"
}

export function TrainingHeatmap({
  entries,
  onOpenTraining,
}: {
  readonly entries: readonly SenseiEntry[]
  readonly onOpenTraining?: () => void
}) {
  const { weeks, activeDays, sessionCount } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start = new Date(today)
    start.setDate(today.getDate() - today.getDay() - (WEEK_COUNT - 1) * DAYS_PER_WEEK)
    const counts = physicalSessionCount(entries)
    const calendar = Array.from({ length: WEEK_COUNT }, (_, weekIndex) =>
      Array.from({ length: DAYS_PER_WEEK }, (_, dayIndex) => {
        const date = new Date(start)
        date.setDate(start.getDate() + weekIndex * DAYS_PER_WEEK + dayIndex)
        const key = toDateKey(date)
        return {
          key,
          count: counts.get(key) ?? 0,
          isFuture: date.getTime() > today.getTime(),
        }
      }),
    )
    const visibleCounts = calendar.flat().map((day) => day.count)

    return {
      weeks: calendar,
      activeDays: visibleCounts.filter((count) => count > 0).length,
      sessionCount: visibleCounts.reduce((sum, count) => sum + count, 0),
    }
  }, [entries])

  return (
    <button
      type="button"
      aria-label={`훈련 활동 달력, 최근 6개월 ${activeDays}일 ${sessionCount}회`}
      onClick={onOpenTraining}
      className="w-full rounded-xl border border-border bg-card/50 p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/70"
    >
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Training rhythm
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">최근 6개월</p>
        </div>
        <p className="text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground num">{activeDays}일</span>
          {" · "}
          <span className="num">{sessionCount}회</span>
        </p>
      </div>

      <div className="flex justify-end gap-0.5 overflow-hidden sm:gap-1" aria-hidden="true">
        {weeks.map((week) => (
          <div key={week[0]?.key} className="grid shrink-0 grid-rows-7 gap-1">
            {week.map((day) => (
              <span
                key={day.key}
                title={`${day.key} · ${day.count}회`}
                className={`size-2 rounded-[3px] border sm:size-3 ${levelClass(day.count, day.isFuture)}`}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
        <span>적음</span>
        {[0, 1, 2, 3].map((count) => (
          <span
            key={count}
            className={`size-2.5 rounded-[3px] border ${levelClass(count, false)}`}
            aria-hidden="true"
          />
        ))}
        <span>많음</span>
      </div>
    </button>
  )
}
