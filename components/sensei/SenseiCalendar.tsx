"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { SenseiEntry } from "@/lib/types/sensei"

function getMonthData(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return { firstDay, daysInMonth }
}

function toDateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

interface SenseiCalendarProps {
  onDateSelect?: (date: string) => void
}

export function SenseiCalendar({ onDateSelect }: SenseiCalendarProps) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const entriesQuery = useQuery({
    queryKey: ["sensei-entries"],
    queryFn: async () => {
      const res = await fetch("/api/notion/sensei")
      if (!res.ok) throw new Error("수련 기록 조회 실패")
      return res.json() as Promise<SenseiEntry[]>
    },
  })

  const entries = entriesQuery.data ?? []

  const dateMap = new Map<string, SenseiEntry[]>()
  for (const entry of entries) {
    if (!entry.date) continue
    const key = entry.date.slice(0, 10)
    const list = dateMap.get(key) ?? []
    list.push(entry)
    dateMap.set(key, list)
  }

  const { firstDay, daysInMonth } = getMonthData(viewYear, viewMonth)
  const selectedEntries = selectedDate ? (dateMap.get(selectedDate) ?? []) : []

  const totalThisMonth = Array.from(dateMap.entries())
    .filter(([key]) => key.startsWith(`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`))
    .reduce((sum, [, list]) => sum + list.length, 0)

  function prevMonth() {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1)
      setViewMonth(11)
    } else {
      setViewMonth(viewMonth - 1)
    }
    setSelectedDate(null)
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1)
      setViewMonth(0)
    } else {
      setViewMonth(viewMonth + 1)
    }
    setSelectedDate(null)
  }

  return (
    <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900 space-y-4">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 border-zinc-700 text-zinc-300"
          onClick={prevMonth}
        >
          ◀
        </Button>
        <div className="text-center">
          <p className="text-white text-sm font-medium">
            {viewYear}년 {viewMonth + 1}월
          </p>
          <p className="text-zinc-500 text-xs">
            이번 달 {totalThisMonth}회 수련
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 border-zinc-700 text-zinc-300"
          onClick={nextMonth}
        >
          ▶
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className={`text-center text-xs py-1 ${day === "일" ? "text-red-400" : day === "토" ? "text-blue-400" : "text-zinc-500"}`}
          >
            {day}
          </div>
        ))}

        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${String(i)}`} className="min-h-[2.75rem]" />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateKey = toDateKey(viewYear, viewMonth, day)
          const dayEntries = dateMap.get(dateKey)
          const hasEntry = !!dayEntries
          const isToday = dateKey === toDateKey(today.getFullYear(), today.getMonth(), today.getDate())
          const isSelected = dateKey === selectedDate
          const hasClass = dayEntries?.some((e) => e.sessionType === "class")
          const hasOpenMat = dayEntries?.some((e) => e.sessionType === "openmat")
          const dayTags = dayEntries
            ? [...new Set([...dayEntries.flatMap((e) => e.classTags), ...dayEntries.flatMap((e) => e.sparringTags)])]
            : []

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => {
                const newDate = isSelected ? null : dateKey
                setSelectedDate(newDate)
                if (newDate) onDateSelect?.(newDate)
              }}
              className={`
                relative rounded-md text-xs flex flex-col items-center justify-start pt-1 min-h-[2.75rem] transition-colors overflow-hidden
                ${isSelected ? "ring-2 ring-orange-500 bg-zinc-700" : ""}
                ${isToday && !isSelected ? "ring-1 ring-zinc-500" : ""}
                ${hasEntry ? "bg-zinc-800 hover:bg-zinc-700 cursor-pointer font-medium" : "text-zinc-600 hover:bg-zinc-800/50"}
                ${hasEntry ? "text-white" : ""}
              `}
            >
              <span className="leading-none">{day}</span>
              {dayTags.length > 0 && (
                <div className="flex flex-wrap justify-center gap-x-0.5 gap-y-0 mt-0.5 max-w-full px-px">
                  {dayTags.slice(0, 2).map((tag) => (
                    <span key={tag} className="text-[7px] leading-tight text-orange-300/80">{tag}</span>
                  ))}
                  {dayTags.length > 2 && (
                    <span className="text-[7px] leading-tight text-zinc-500">+{dayTags.length - 2}</span>
                  )}
                </div>
              )}
              {hasEntry && (
                <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                  {hasClass && <div className="w-1 h-1 rounded-full bg-purple-400" />}
                  {hasOpenMat && <div className="w-1 h-1 rounded-full bg-green-400" />}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {selectedDate && (
        <div className="space-y-2 pt-2 border-t border-zinc-700">
          <p className="text-zinc-400 text-xs">{selectedDate} 수련 기록</p>
          {selectedEntries.length === 0 ? (
            <p className="text-zinc-500 text-xs">기록이 없습니다.</p>
          ) : (
            selectedEntries.map((entry) => (
              <div key={entry.id} className="border border-zinc-700 rounded-lg p-3 bg-zinc-800/50 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-white text-sm font-medium">{entry.title}</p>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${entry.sessionType === "openmat" ? "border-green-500/40 text-green-300" : "border-purple-500/40 text-purple-300"}`}
                  >
                    {entry.sessionType === "openmat" ? "Open Mat" : "Class"}
                  </Badge>
                  {entry.instructor && (
                    <Badge variant="outline" className="text-[10px] border-zinc-600 text-zinc-300">
                      {entry.instructor}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {entry.classTags.map((tag) => (
                    <Badge key={`cal-c-${entry.id}-${tag}`} variant="outline" className="text-[10px] border-orange-500/40 text-orange-300">
                      Class: {tag}
                    </Badge>
                  ))}
                  {entry.sparringTags.map((tag) => (
                    <Badge key={`cal-s-${entry.id}-${tag}`} variant="outline" className="text-[10px] border-blue-500/40 text-blue-300">
                      Sparring: {tag}
                    </Badge>
                  ))}
                </div>
                {entry.note && <p className="text-zinc-300 text-xs whitespace-pre-wrap">{entry.note}</p>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
