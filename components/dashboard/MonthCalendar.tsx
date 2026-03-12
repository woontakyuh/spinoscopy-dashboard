"use client"

import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

interface DashboardScheduleItem {
  id: string
  title: string
  start: string
  end: string | null
  location: string
  category: string
  source: "notion" | "gcal" | "both"
  notionUrl?: string
  gcalUrl?: string
}

async function fetchCalendar(month: string): Promise<DashboardScheduleItem[]> {
  const res = await fetch(`/api/dashboard/calendar?month=${month}`)
  if (!res.ok) throw new Error("달력 데이터 로딩 실패")
  return res.json()
}

interface ParsedScheduleData {
  name: string
  date_start: string
  date_end?: string
  place?: string
  category?: string
  topic?: string
}

async function parseNaturalLanguage(text: string): Promise<ParsedScheduleData> {
  const res = await fetch("/api/jarvis/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "schedule", text }),
  })
  if (!res.ok) {
    throw new Error("자연어 파싱 실패")
  }
  const data = (await res.json()) as { success: boolean; parsed?: ParsedScheduleData; error?: string }
  if (!data.success || !data.parsed) {
    throw new Error(data.error ?? "일정 정보를 추출하지 못했습니다.")
  }
  return data.parsed
}

async function createQuickSchedule(text: string, selectedDate: string): Promise<void> {
  // 1) NLP 파싱 — 자연어에서 이름, 장소, 날짜 추출
  const parsed = await parseNaturalLanguage(text)

  // 2) 선택된 날짜를 기본값으로, 파싱된 날짜가 있으면 사용
  const dateStart = parsed.date_start || selectedDate

  // 3) GCal 전용으로 일정 생성
  const res = await fetch("/api/jarvis/schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: parsed.name,
      date_start: dateStart,
      date_end: parsed.date_end,
      place: parsed.place,
      category: parsed.category,
      topic: parsed.topic,
      targets: ["gcal"],
    }),
  })
  if (!res.ok) {
    const data = (await res.json()) as { error?: string }
    throw new Error(data.error ?? "일정 생성 실패")
  }
}

function getTodaySeoul(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

function getCurrentMonthSeoul(): string {
  const today = getTodaySeoul()
  return today.slice(0, 7)
}

function getMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return `${y}년 ${m}월`
}

function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number)
  if (m === 1) return `${y - 1}-12`
  return `${y}-${String(m - 1).padStart(2, "0")}`
}

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number)
  if (m === 12) return `${y + 1}-01`
  return `${y}-${String(m + 1).padStart(2, "0")}`
}

function getDaysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m, 0).getDate()
}

function getFirstDayOfWeek(month: string): number {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m - 1, 1).getDay()
}

function formatTime(start: string, end: string | null): string {
  const hasTime = start.includes("T")
  if (!hasTime) return "종일"

  const startDate = new Date(start)
  const label = startDate.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

  if (!end || !end.includes("T")) return label

  const endDate = new Date(end)
  const endLabel = endDate.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

  return `${label} - ${endLabel}`
}

function formatSelectedDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00+09:00")
  return date.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  })
}

function sourceColor(source: DashboardScheduleItem["source"]): string {
  if (source === "notion") return "bg-blue-500"
  if (source === "gcal") return "bg-green-500"
  return "bg-cyan-500"
}

function sourceBadgeClass(source: DashboardScheduleItem["source"]): string {
  if (source === "notion") return "border-blue-500/50 text-blue-300"
  if (source === "gcal") return "border-green-500/50 text-green-300"
  return "border-cyan-500/50 text-cyan-300"
}

function sourceLabel(source: DashboardScheduleItem["source"]): string {
  if (source === "both") return "Both"
  if (source === "notion") return "Notion"
  return "GCal"
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

export function MonthCalendar() {
  const queryClient = useQueryClient()
  const today = getTodaySeoul()
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonthSeoul)
  const [selectedDate, setSelectedDate] = useState(today)
  const [quickName, setQuickName] = useState("")
  const [quickError, setQuickError] = useState<string | null>(null)

  const { data: events, isLoading } = useQuery({
    queryKey: ["dashboard-calendar", currentMonth],
    queryFn: () => fetchCalendar(currentMonth),
    refetchInterval: 120000,
  })

  const createMutation = useMutation({
    mutationFn: ({ text, date }: { text: string; date: string }) =>
      createQuickSchedule(text, date),
    onSuccess: async () => {
      setQuickName("")
      setQuickError(null)
      await queryClient.invalidateQueries({ queryKey: ["dashboard-calendar", currentMonth] })
      await queryClient.invalidateQueries({ queryKey: ["dashboard-schedule"] })
      await queryClient.invalidateQueries({ queryKey: ["dashboard-upcoming"] })
    },
    onError: (err) => {
      setQuickError(err instanceof Error ? err.message : "일정 생성 중 오류")
    },
  })

  const eventsByDate = useMemo(() => {
    const map = new Map<string, DashboardScheduleItem[]>()
    for (const event of events ?? []) {
      const dateKey = event.start.slice(0, 10)
      const existing = map.get(dateKey) ?? []
      existing.push(event)
      map.set(dateKey, existing)
    }
    return map
  }, [events])

  const selectedEvents = eventsByDate.get(selectedDate) ?? []

  const daysInMonth = getDaysInMonth(currentMonth)
  const firstDay = getFirstDayOfWeek(currentMonth)

  const handleQuickAdd = (e: { preventDefault: () => void }) => {
    e.preventDefault()
    if (createMutation.isPending) return
    setQuickError(null)
    const name = quickName.trim()
    if (!name) {
      setQuickError("일정명을 입력하세요.")
      return
    }
    createMutation.mutate({ text: name, date: selectedDate })
  }

  const goToToday = () => {
    const t = getTodaySeoul()
    setCurrentMonth(t.slice(0, 7))
    setSelectedDate(t)
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentMonth(prevMonth(currentMonth))}
            className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <h3 className="text-base font-semibold text-zinc-100 min-w-[100px] text-center">
            {getMonthLabel(currentMonth)}
          </h3>
          <button
            onClick={() => setCurrentMonth(nextMonth(currentMonth))}
            className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={goToToday}
          className="text-xs border-zinc-700 text-zinc-300 hover:bg-zinc-800"
        >
          오늘
        </Button>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-0">
        {/* Weekday headers */}
        {WEEKDAYS.map((day, i) => (
          <div
            key={day}
            className={`text-center text-xs font-medium py-2 ${
              i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-zinc-500"
            }`}
          >
            {day}
          </div>
        ))}

        {/* Empty cells before first day */}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} className="py-2" />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateStr = `${currentMonth}-${String(day).padStart(2, "0")}`
          const isToday = dateStr === today
          const isSelected = dateStr === selectedDate
          const dayEvents = eventsByDate.get(dateStr) ?? []
          const dayOfWeek = (firstDay + i) % 7

          const sources = new Set(dayEvents.map((e) => e.source))
          const dots: string[] = []
          if (sources.has("notion") || sources.has("both")) dots.push("bg-blue-500")
          if (sources.has("gcal") || sources.has("both")) dots.push("bg-green-500")
          if (dots.length === 0 && dayEvents.length > 0) dots.push("bg-zinc-500")

          return (
            <button
              key={dateStr}
              onClick={() => setSelectedDate(dateStr)}
              className={`py-2 flex flex-col items-center justify-center rounded-lg text-sm transition-colors relative
                ${isSelected
                  ? "bg-zinc-700 ring-1 ring-cyan-500"
                  : "hover:bg-zinc-800/60"
                }
                ${isToday && !isSelected ? "ring-1 ring-zinc-600" : ""}
              `}
            >
              <span
                className={`
                  ${isToday ? "font-bold text-cyan-400" : ""}
                  ${dayOfWeek === 0 ? "text-red-400" : dayOfWeek === 6 ? "text-blue-400" : "text-zinc-300"}
                  ${isSelected ? "text-white" : ""}
                `}
              >
                {day}
              </span>
              {dots.length > 0 && (
                <div className="flex gap-0.5 mt-0.5">
                  {dots.map((color, di) => (
                    <div key={di} className={`w-1 h-1 rounded-full ${color}`} />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Selected date detail */}
      <div className="mt-4 pt-4 border-t border-zinc-800">
        <h4 className="text-sm font-medium text-zinc-300 mb-3">
          {formatSelectedDate(selectedDate)}
        </h4>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full bg-zinc-800" />
          </div>
        ) : selectedEvents.length === 0 ? (
          <p className="text-zinc-500 text-sm">일정이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {selectedEvents.map((event) => (
              <div
                key={event.id}
                className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2.5 flex items-start justify-between gap-2"
              >
                <div className="flex items-start gap-2 min-w-0">
                  <div className={`w-0.5 h-full min-h-[32px] rounded-full ${sourceColor(event.source)} shrink-0 mt-0.5`} />
                  <div className="min-w-0">
                    <p className="text-zinc-100 text-sm font-medium truncate">{event.title}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-400">
                      <span>{formatTime(event.start, event.end)}</span>
                      {event.location && <span className="truncate">· {event.location}</span>}
                    </div>
                  </div>
                </div>
                <Badge variant="outline" className={`shrink-0 text-xs ${sourceBadgeClass(event.source)}`}>
                  {sourceLabel(event.source)}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {/* Quick add */}
        <form onSubmit={handleQuickAdd} className="flex gap-2 mt-3">
          <Input
            value={quickName}
            onChange={(e) => setQuickName(e.target.value)}
            placeholder="자연어로 일정 추가 (예: 봉산짬뽕에서 점심 식사)"
            className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm"
            disabled={createMutation.isPending}
          />
          <Button
            type="submit"
            size="sm"
            disabled={createMutation.isPending}
            className="bg-blue-600 hover:bg-blue-500 text-white shrink-0"
          >
            {createMutation.isPending ? "파싱 중..." : "추가"}
          </Button>
        </form>
        {quickError && (
          <p className="mt-1.5 text-xs text-red-300">오류: {quickError}</p>
        )}
      </div>
    </div>
  )
}
