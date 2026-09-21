"use client"

import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Play } from "lucide-react"
import { getTrainingRuleSet, isRuleSetTag } from "@/lib/sensei/trainingEntry"
import type { SenseiEntry, SenseiSessionType } from "@/lib/types/sensei"

type SenseiYearTableProps = {
  readonly entries: readonly SenseiEntry[]
  readonly selectedDate: string | null
  readonly onDateSelect: (date: string | null) => void
}

const SESSION_LABEL: Record<SenseiSessionType, string> = {
  class: "수업",
  openmat: "오픈매트",
  promotion: "승급",
  study: "공부",
}

const SESSION_STYLE: Record<SenseiSessionType, string> = {
  class: "border-purple-400/40 bg-purple-500/15 text-purple-200",
  openmat: "border-green-400/40 bg-green-500/15 text-green-200",
  promotion: "border-yellow-400/40 bg-yellow-500/15 text-yellow-200",
  study: "border-blue-400/40 bg-blue-500/15 text-blue-200",
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"]

type DayRow = {
  readonly date: string
  readonly month: number
  readonly day: number
  readonly weekday: string
  readonly sessionTypes: readonly SenseiSessionType[]
  readonly title: string
  readonly keywords: readonly string[]
  readonly videoUrl?: string
  readonly ruleSets: readonly string[]
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

/** 하루에 여러 기록이 있으면 한 줄로 합친다. */
function buildRows(entries: readonly SenseiEntry[], year: number): DayRow[] {
  const byDate = new Map<string, SenseiEntry[]>()
  for (const entry of entries) {
    if (!entry.date || !entry.date.startsWith(`${year}-`)) continue
    byDate.set(entry.date, [...(byDate.get(entry.date) ?? []), entry])
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dayEntries]) => {
      const [, m, d] = date.split("-").map(Number)
      const withVideo = dayEntries.find((entry) => entry.videoUrl)
      return {
        date,
        month: m,
        day: d,
        weekday: WEEKDAY[new Date(date).getDay()],
        sessionTypes: unique(dayEntries.map((entry) => entry.sessionType)),
        title: dayEntries.map((entry) => entry.title).filter(Boolean).join(" · "),
        keywords: unique(
          dayEntries.flatMap((entry) => [...entry.classTags, ...entry.sparringTags]),
        ).filter((tag) => !isRuleSetTag(tag)),
        videoUrl: withVideo?.videoUrl,
        ruleSets: unique(
          dayEntries.map(getTrainingRuleSet).filter((r): r is "gi" | "nogi" => r !== null),
        ),
      }
    })
}

export function SenseiYearTable({ entries, selectedDate, onDateSelect }: SenseiYearTableProps) {
  const years = useMemo(() => {
    const found = unique(
      entries.map((entry) => entry.date?.slice(0, 4)).filter((y): y is string => Boolean(y)),
    ).sort()
    return found.length > 0 ? found : [String(new Date().getFullYear())]
  }, [entries])

  const [year, setYear] = useState<number>(() => {
    const fromSelection = selectedDate ? Number(selectedDate.slice(0, 4)) : NaN
    return Number.isNaN(fromSelection) ? Number(years.at(-1)) : fromSelection
  })

  const rows = useMemo(() => buildRows(entries, year), [entries, year])
  const index = years.indexOf(String(year))
  const monthCounts = useMemo(() => {
    const counts = new Array(12).fill(0)
    for (const row of rows) counts[row.month - 1] += 1
    return counts
  }, [rows])

  function moveYear(offset: number) {
    const next = years[index + offset]
    if (next) {
      setYear(Number(next))
      onDateSelect(null)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => moveYear(-1)}
            disabled={index <= 0}
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted disabled:opacity-30"
            aria-label="이전 해"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <span className="min-w-[4.5rem] text-center text-sm font-semibold text-foreground">
            {year}년
          </span>
          <button
            type="button"
            onClick={() => moveYear(1)}
            disabled={index >= years.length - 1}
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted disabled:opacity-30"
            aria-label="다음 해"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
        <span className="text-xs text-muted-foreground">{rows.length}일 기록</span>
      </div>

      {/* 월별 분포 — 어느 달에 몰렸는지 한눈에 */}
      <div className="mt-3 flex gap-1">
        {monthCounts.map((count, i) => {
          const max = Math.max(...monthCounts, 1)
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-10 w-full items-end">
                <div
                  className={`w-full rounded-sm ${count > 0 ? "bg-orange-400/70" : "bg-muted"}`}
                  style={{ height: `${count > 0 ? Math.max(12, (count / max) * 100) : 4}%` }}
                />
              </div>
              <span className="text-[9px] text-muted-foreground">{i + 1}</span>
            </div>
          )
        })}
      </div>

      <div className="mt-3 max-h-[28rem] overflow-y-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-2 font-semibold">날짜</th>
              <th className="py-2 pr-2 font-semibold">유형</th>
              <th className="py-2 pr-2 font-semibold">내용</th>
              <th className="py-2 pr-1 font-semibold">영상</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                  {year}년 기록이 없어.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const isActive = row.date === selectedDate
              return (
                <tr
                  key={row.date}
                  onClick={() => onDateSelect(row.date)}
                  className={`cursor-pointer border-b border-border/50 align-top transition ${
                    isActive ? "bg-orange-500/10" : "hover:bg-muted/50"
                  }`}
                >
                  <td className="whitespace-nowrap py-2 pr-2 text-xs tabular-nums text-foreground">
                    {row.month}/{row.day}
                    <span className="ml-1 text-[10px] text-muted-foreground">{row.weekday}</span>
                  </td>
                  <td className="py-2 pr-2">
                    <div className="flex flex-wrap gap-1">
                      {row.sessionTypes.map((type) => (
                        <span
                          key={type}
                          className={`rounded-full border px-1.5 py-0.5 text-[10px] ${SESSION_STYLE[type]}`}
                        >
                          {SESSION_LABEL[type]}
                        </span>
                      ))}
                      {row.ruleSets.includes("nogi") && (
                        <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          No-Gi
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 pr-2">
                    <p className="break-keep text-xs leading-5 text-foreground/90 line-clamp-2">
                      {row.title || "—"}
                    </p>
                    {row.keywords.length > 0 && (
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {row.keywords.slice(0, 6).join(" · ")}
                      </p>
                    )}
                  </td>
                  <td className="py-2 pr-1">
                    {row.videoUrl && (
                      <a
                        href={row.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="inline-flex items-center text-orange-300 transition hover:text-orange-200"
                        aria-label="수업 정리 영상 열기"
                      >
                        <Play className="size-3.5" aria-hidden="true" />
                      </a>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
