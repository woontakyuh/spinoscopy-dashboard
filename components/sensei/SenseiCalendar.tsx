"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  getTrainingRuleSet,
  isRuleSetTag,
  type TrainingFilter,
  type TrainingRuleSet,
} from "@/lib/sensei/trainingEntry"
import type { SenseiEntry } from "@/lib/types/sensei"

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const

type SenseiCalendarProps = {
  readonly entries: readonly SenseiEntry[]
  readonly selectedDate: string | null
  readonly onDateSelect: (date: string | null) => void
  readonly activeFilter: TrainingFilter | null
  readonly onFilterChange: (filter: TrainingFilter | null) => void
}

type DaySummary = {
  readonly classKeywords: readonly string[]
  readonly sparringKeywords: readonly string[]
  readonly studyKeywords: readonly string[]
  readonly entries: readonly SenseiEntry[]
  readonly hasPromotion: boolean
  readonly ruleSets: readonly TrainingRuleSet[]
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => Boolean(value) && !isRuleSetTag(value)))]
}

function isRuleSet(value: TrainingRuleSet | null): value is TrainingRuleSet {
  return value !== null
}

function summarizeDay(entries: readonly SenseiEntry[]): DaySummary {
  return {
    classKeywords: unique(entries.flatMap((entry) => entry.classTags)),
    sparringKeywords: unique(entries.flatMap((entry) => entry.sparringTags)),
    studyKeywords: unique(entries.flatMap((entry) => entry.studyTags)),
    entries,
    hasPromotion: entries.some((entry) => entry.sessionType === "promotion"),
    ruleSets: [...new Set(entries.map(getTrainingRuleSet).filter(isRuleSet))],
  }
}

const FILTERS = [
  {
    key: "class",
    label: "수업",
    dot: "bg-purple-400",
    active: "border-purple-400/50 bg-purple-500/15 text-purple-200",
  },
  {
    key: "sparring",
    label: "스파링",
    dot: "bg-blue-400",
    active: "border-blue-400/50 bg-blue-500/15 text-blue-200",
  },
  {
    key: "study",
    label: "공부",
    dot: "bg-green-400",
    active: "border-green-400/50 bg-green-500/15 text-green-200",
  },
] as const satisfies readonly {
  readonly key: TrainingFilter
  readonly label: string
  readonly dot: string
  readonly active: string
}[]

function KeywordRow({
  color,
  label,
  keywords,
}: {
  readonly color: string
  readonly label: string
  readonly keywords: readonly string[]
}) {
  if (keywords.length === 0) return null

  return (
    <div className="flex min-w-0 items-center gap-0.5 sm:gap-1">
      <span className={`size-1 shrink-0 rounded-full sm:size-1.5 ${color}`} aria-hidden="true" />
      <span className="truncate text-[9px] leading-3 text-foreground/80 sm:text-[10px] sm:leading-4">
        <span className="sr-only">{label}: </span>
        {keywords.slice(0, 2).join(" · ")}
      </span>
    </div>
  )
}

export function SenseiCalendar({
  entries,
  selectedDate,
  onDateSelect,
  activeFilter,
  onFilterChange,
}: SenseiCalendarProps) {
  // 선택된 날짜가 있으면 그 달로 연다 — 히트맵에서 8/25 를 들고 왔는데 9월 빈 달력이 뜨면 안 된다
  const [viewDate, setViewDate] = useState(() => {
    if (selectedDate) {
      const d = new Date(`${selectedDate}T00:00:00`)
      if (!Number.isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), 1)
    }
    return new Date()
  })
  const viewYear = viewDate.getFullYear()
  const viewMonth = viewDate.getMonth()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const today = new Date()
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate())
  const monthKey = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`

  const monthEntries = useMemo(
    () => entries.filter((entry) => entry.date?.startsWith(monthKey)),
    [entries, monthKey],
  )
  const summaries = useMemo(() => {
    const entriesByDate = new Map<string, SenseiEntry[]>()
    for (const entry of monthEntries) {
      if (!entry.date) continue
      const current = entriesByDate.get(entry.date) ?? []
      current.push(entry)
      entriesByDate.set(entry.date, current)
    }
    return new Map(
      [...entriesByDate.entries()].map(([date, dayEntries]) => [date, summarizeDay(dayEntries)]),
    )
  }, [monthEntries])

  function moveMonth(offset: number) {
    setViewDate(new Date(viewYear, viewMonth + offset, 1))
    onDateSelect(null)
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          aria-label="이전 달"
          className="size-11 rounded-full border-border bg-background/40 p-0 text-sm text-foreground/90 hover:bg-muted"
          onClick={() => moveMonth(-1)}
        >
          ←
        </Button>
        <div className="text-center">
          <p className="text-lg font-semibold tracking-tight text-foreground num">
            {viewYear}년 {viewMonth + 1}월
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            <span className="font-semibold text-orange-400 num">{monthEntries.length}회</span> 훈련 기록
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          aria-label="다음 달"
          className="size-11 rounded-full border-border bg-background/40 p-0 text-sm text-foreground/90 hover:bg-muted"
          onClick={() => moveMonth(1)}
        >
          →
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-center gap-2 border-b border-border pb-3 text-[11px] text-muted-foreground">
        {FILTERS.map((filter) => {
          const isActive = activeFilter === filter.key
          return (
            <button
              key={filter.key}
              type="button"
              aria-label={`${filter.label} 필터`}
              aria-pressed={isActive}
              onClick={() => onFilterChange(isActive ? null : filter.key)}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/70 ${
                isActive
                  ? filter.active
                  : "border-border bg-background/35 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span className={`size-2 rounded-full ${filter.dot}`} aria-hidden="true" />
              {filter.label}
            </button>
          )
        })}
        <span className="ml-auto hidden sm:inline">날짜를 누르면 우측에 상세가 열려</span>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className={`py-1 text-center text-[10px] font-semibold ${
              day === "일"
                ? "text-red-400"
                : day === "토"
                  ? "text-blue-400"
                  : "text-muted-foreground"
            }`}
          >
            {day}
          </div>
        ))}

        {Array.from({ length: firstDay }, (_, index) => (
          <div key={`empty-${index}`} className="min-h-20 sm:min-h-24 lg:min-h-28" />
        ))}

        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1
          const currentDate = dateKey(viewYear, viewMonth, day)
          const summary = summaries.get(currentDate)
          const isSelected = selectedDate === currentDate
          const isToday = todayKey === currentDate
          const keywords = summary
            ? [
                ...(activeFilter === null || activeFilter === "class" ? summary.classKeywords : []),
                ...(activeFilter === null || activeFilter === "sparring" ? summary.sparringKeywords : []),
                ...(activeFilter === null || activeFilter === "study" ? summary.studyKeywords : []),
              ]
            : []
          const ruleSetLabel = summary?.ruleSets
            .map((ruleSet) => ruleSet === "gi" ? "Gi" : "No-Gi")
            .join("/") ?? ""

          return (
            <button
              key={currentDate}
              type="button"
              aria-label={[
                `${viewMonth + 1}월 ${day}일`,
                ...keywords,
                ...(ruleSetLabel ? [ruleSetLabel] : []),
              ].join(", ")}
              onClick={() => onDateSelect(currentDate)}
              className={`relative flex min-h-20 min-w-0 flex-col overflow-hidden rounded-lg border p-1 text-left transition-colors sm:min-h-24 sm:p-2 lg:min-h-28 ${
                isSelected
                  ? "border-orange-400 bg-orange-500/12 ring-2 ring-orange-500/30"
                  : summary
                    ? "border-border bg-muted/55 hover:bg-muted"
                    : "border-transparent text-muted-foreground/60 hover:bg-muted/35"
              } ${isToday && !isSelected ? "border-zinc-500" : ""}`}
            >
              <div className="flex w-full items-center">
                <span className="text-xs font-medium num">{day}</span>
              </div>
              {summary && summary.ruleSets.length > 0 && (
                <span className={`mt-0.5 w-full text-right text-[10px] font-semibold leading-3 ${
                    summary.ruleSets.includes("nogi") ? "text-blue-300" : "text-zinc-300"
                  }`}>
                  {ruleSetLabel}
                </span>
              )}

              {summary && (
                <>
                  <div className="mt-0.5 w-full min-w-0 space-y-0.5 sm:mt-1 sm:space-y-1">
                    {(activeFilter === null || activeFilter === "class") && (
                      <KeywordRow
                        color="bg-purple-400"
                        label="수업"
                        keywords={summary.classKeywords}
                      />
                    )}
                    {(activeFilter === null || activeFilter === "sparring") && (
                      <KeywordRow
                        color="bg-blue-400"
                        label="스파링"
                        keywords={summary.sparringKeywords}
                      />
                    )}
                    {(activeFilter === null || activeFilter === "study") && (
                      <KeywordRow
                        color="bg-green-400"
                        label="공부"
                        keywords={summary.studyKeywords}
                      />
                    )}
                  </div>
                  {summary.hasPromotion && (
                    <span className="absolute bottom-1 right-1 size-1.5 rounded-full bg-yellow-400" aria-label="승급" />
                  )}
                </>
              )}
            </button>
          )
        })}
      </div>

    </div>
  )
}
