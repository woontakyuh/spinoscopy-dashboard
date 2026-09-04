"use client"

import { useMemo, useState } from "react"
import type { SenseiEntry } from "@/lib/types/sensei"
import { SESSION_LABELS, isPhysicalSession, ruleSetOf, summarizeEntry } from "@/lib/sensei/sessionLabels"

const WEEK_COUNT = 53
const DAYS_PER_WEEK = 7

interface HeatmapDay {
  /** 그날의 모든 기록 — 툴팁에 카테고리+요약으로 보여준다 */
  readonly sessions: readonly SenseiEntry[]
  readonly key: string
  readonly count: number
}

interface MonthLabel {
  readonly key: string
  readonly label: string
  readonly weekIndex: number
}

function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function physicalSessionCount(entries: readonly SenseiEntry[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    if (!entry.date || !isPhysicalSession(entry)) continue
    counts.set(entry.date, (counts.get(entry.date) ?? 0) + 1)
  }
  return counts
}

/** 날짜별 기록. 몸으로 한 세션이 먼저, 공부·승급은 뒤에 */
function entriesByDate(entries: readonly SenseiEntry[]): Map<string, SenseiEntry[]> {
  const byDate = new Map<string, SenseiEntry[]>()
  for (const entry of entries) {
    if (!entry.date) continue
    const list = byDate.get(entry.date) ?? []
    list.push(entry)
    byDate.set(entry.date, list)
  }
  for (const list of byDate.values()) {
    list.sort((a, b) => Number(isPhysicalSession(b)) - Number(isPhysicalSession(a)))
  }
  return byDate
}

function levelClass(count: number): string {
  if (count >= 3) return "border-orange-300/70 bg-orange-400"
  if (count === 2) return "border-orange-500/60 bg-orange-500/75"
  if (count === 1) return "border-orange-400/60 bg-orange-600/80"
  return "border-border/60 bg-muted/55"
}

function formatDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number)
  return `${year}년 ${month}월 ${day}일`
}

function getMonthLabels(weeks: readonly (readonly HeatmapDay[])[]): MonthLabel[] {
  const labels: MonthLabel[] = []
  const seen = new Set<string>()

  weeks.forEach((week, weekIndex) => {
    for (const day of week) {
      const monthKey = day.key.slice(0, 7)
      const isFirstVisibleMonth = labels.length === 0
      const isFirstDayOfMonth = day.key.endsWith("-01")
      if ((!isFirstVisibleMonth && !isFirstDayOfMonth) || seen.has(monthKey)) continue

      seen.add(monthKey)
      labels.push({
        key: monthKey,
        label: `${Number(monthKey.slice(5, 7))}월`,
        weekIndex,
      })
    }
  })

  return labels
}

export function TrainingHeatmap({
  entries,
  onOpenTraining,
}: {
  readonly entries: readonly SenseiEntry[]
  readonly onOpenTraining?: () => void
}) {
  const [hoveredDayKey, setHoveredDayKey] = useState<string | null>(null)

  const { weeks, monthLabels, activeDays, sessionCount } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const start = new Date(today)
    start.setDate(today.getDate() - today.getDay() - ((WEEK_COUNT - 1) * DAYS_PER_WEEK))

    const counts = physicalSessionCount(entries)
    const byDate = entriesByDate(entries)

    const days: HeatmapDay[] = []
    for (const date = new Date(start); date <= today; date.setDate(date.getDate() + 1)) {
      const key = toDateKey(date)
      days.push({ key, count: counts.get(key) ?? 0, sessions: byDate.get(key) ?? [] })
    }
    const calendar = Array.from(
      { length: Math.ceil(days.length / DAYS_PER_WEEK) },
      (_, weekIndex) => days.slice(weekIndex * DAYS_PER_WEEK, (weekIndex + 1) * DAYS_PER_WEEK),
    )
    const visibleCounts = days.map((day) => day.count)

    return {
      weeks: calendar,
      monthLabels: getMonthLabels(calendar),
      activeDays: visibleCounts.filter((count) => count > 0).length,
      sessionCount: visibleCounts.reduce((sum, count) => sum + count, 0),
    }
  }, [entries])

  return (
    <button
      type="button"
      aria-label={`훈련 활동 달력, 최근 1년 ${activeDays}일 ${sessionCount}회`}
      onClick={onOpenTraining}
      className="w-full rounded-xl border border-border bg-card/50 p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/70"
    >
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Training rhythm
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">최근 1년</p>
        </div>
        <p className="text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground num">{activeDays}일</span>
          {" · "}
          <span className="num">{sessionCount}회</span>
        </p>
      </div>

      <div
        data-testid="training-heatmap-calendar"
        className="mr-auto grid w-full max-w-[820px] grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2"
      >
        <span aria-hidden="true" />
        <div className="relative mb-1 h-4" aria-hidden="true">
          {monthLabels.map((month) => (
            <span
              key={month.key}
              data-testid={`heatmap-month-${month.key}`}
              className="absolute top-0 whitespace-nowrap text-[10px] text-muted-foreground"
              style={{ left: `${(month.weekIndex / WEEK_COUNT) * 100}%` }}
            >
              {month.label}
            </span>
          ))}
        </div>

        <div
          className="grid grid-rows-7 items-center text-[9px] text-muted-foreground"
          aria-hidden="true"
        >
          <span />
          <span>월</span>
          <span />
          <span>수</span>
          <span />
          <span>금</span>
          <span />
        </div>

        <div
          className="grid min-w-0 gap-[2px]"
          style={{ gridTemplateColumns: `repeat(${WEEK_COUNT}, minmax(0, 1fr))` }}
        >
          {weeks.map((week, weekIndex) => (
            <div key={week[0]?.key} className="grid min-w-0 grid-rows-7 gap-[2px]">
              {week.map((day) => (
                <span key={day.key} className="relative block min-w-0">
                  <span
                    data-heatmap-day
                    title={`${day.key} · ${day.count}회`}
                    onMouseEnter={() => setHoveredDayKey(day.key)}
                    onMouseLeave={() => setHoveredDayKey(null)}
                    className={`block aspect-square w-full rounded-[2px] border transition-[filter,transform] duration-100 hover:z-10 hover:scale-125 hover:brightness-125 motion-reduce:transform-none ${levelClass(day.count)}`}
                  />
                  {hoveredDayKey === day.key && (
                    <span
                      role="tooltip"
                      // 가장자리 주에서는 툴팁이 카드 밖으로 나가니 앵커를 안쪽으로 튼다
                      className={`pointer-events-none absolute bottom-full z-30 mb-1.5 w-64 rounded-md border border-border bg-popover px-2.5 py-2 text-left text-[11px] text-popover-foreground shadow-lg ${
                        weekIndex < 6 ? "left-0" : weekIndex > WEEK_COUNT - 7 ? "right-0" : "left-1/2 -translate-x-1/2"
                      }`}
                    >
                      <span className="block font-semibold text-foreground">
                        {formatDate(day.key)}
                        {day.count > 0 && <span className="ml-1 font-normal text-muted-foreground">· {day.count}회</span>}
                      </span>
                      {day.sessions.length === 0 ? (
                        <span className="mt-1 block text-muted-foreground">기록 없음</span>
                      ) : (
                        <span className="mt-1.5 block space-y-1">
                          {day.sessions.map((entry) => {
                            const rule = ruleSetOf(entry)
                            return (
                              <span key={entry.id} className="block leading-snug">
                                <span className="mr-1 inline-block rounded bg-orange-500/15 px-1 py-px text-[10px] font-semibold text-orange-500">
                                  {SESSION_LABELS[entry.sessionType]}{rule ? ` · ${rule}` : ""}
                                </span>
                                <span className="text-foreground/90 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                                  {summarizeEntry(entry)}
                                </span>
                              </span>
                            )
                          })}
                        </span>
                      )}
                    </span>
                  )}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex w-full max-w-[820px] items-center justify-end gap-1 text-[10px] text-muted-foreground">
        <span>적음</span>
        {[0, 1, 2, 3].map((count) => (
          <span
            key={count}
            className={`size-2.5 rounded-[2px] border ${levelClass(count)}`}
            aria-hidden="true"
          />
        ))}
        <span>많음</span>
      </div>
    </button>
  )
}
