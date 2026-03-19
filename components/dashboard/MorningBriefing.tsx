"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { WeatherInline, useWeatherLocation } from "@/components/dashboard/WeatherInline"

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

async function fetchSchedule(): Promise<DashboardScheduleItem[]> {
  const res = await fetch("/api/dashboard/schedule")
  if (!res.ok) throw new Error("일정 로딩 실패")
  return res.json()
}

async function fetchUpcoming(): Promise<DashboardScheduleItem[]> {
  const res = await fetch("/api/dashboard/schedule?upcoming=true")
  if (!res.ok) throw new Error("다가오는 일정 로딩 실패")
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

async function createQuickSchedule(text: string): Promise<void> {
  // 1) NLP 파싱 — 자연어에서 이름, 장소, 날짜 추출
  const parseRes = await fetch("/api/jarvis/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "schedule", text }),
  })
  if (!parseRes.ok) {
    throw new Error("자연어 파싱 실패")
  }
  const parseData = (await parseRes.json()) as { success: boolean; parsed?: ParsedScheduleData; error?: string }
  if (!parseData.success || !parseData.parsed) {
    throw new Error(parseData.error ?? "일정 정보를 추출하지 못했습니다.")
  }

  const parsed = parseData.parsed
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })

  // 2) GCal 전용으로 일정 생성 (파싱된 날짜 사용, 없으면 오늘)
  const res = await fetch("/api/jarvis/schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: parsed.name,
      date_start: parsed.date_start || today,
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

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

function formatTimeRange(start: string, end: string | null): string {
  const hasTime = start.includes("T")
  if (!hasTime) return "종일"

  const startDate = new Date(start)
  const endDate = end ? new Date(end) : null
  const startLabel = startDate.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

  if (!endDate) return startLabel

  const endLabel = endDate.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

  return `${startLabel} - ${endLabel}`
}

function formatUpcomingDate(start: string): string {
  const dateStr = start.slice(0, 10)
  const date = new Date(dateStr + "T00:00:00+09:00")
  return date.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  })
}

function sourceLabel(source: DashboardScheduleItem["source"]): string {
  if (source === "both") return "Both"
  if (source === "notion") return "Notion"
  return "GCal"
}

export function MorningBriefing() {
  const queryClient = useQueryClient()
  const [quickName, setQuickName] = useState("")
  const [quickAddError, setQuickAddError] = useState<string | null>(null)

  const { data: schedules, isLoading, error } = useQuery({
    queryKey: ["dashboard-schedule"],
    queryFn: fetchSchedule,
    refetchInterval: 60000,
  })

  const { data: upcoming } = useQuery({
    queryKey: ["dashboard-upcoming"],
    queryFn: fetchUpcoming,
    refetchInterval: 60000,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => createQuickSchedule(name),
    onSuccess: async () => {
      setQuickName("")
      setQuickAddError(null)
      await queryClient.invalidateQueries({ queryKey: ["dashboard-schedule"] })
      await queryClient.invalidateQueries({ queryKey: ["dashboard-upcoming"] })
      await queryClient.invalidateQueries({ queryKey: ["dashboard-calendar"] })
    },
    onError: (err) => {
      setQuickAddError(err instanceof Error ? err.message : "일정 생성 중 오류가 발생했습니다.")
    },
  })

  const handleQuickAdd = (event: { preventDefault: () => void }) => {
    event.preventDefault()
    if (createMutation.isPending) return
    setQuickAddError(null)
    const name = quickName.trim()
    if (!name) {
      setQuickAddError("일정명을 입력하세요.")
      return
    }
    createMutation.mutate(name)
  }

  const weatherLocation = useWeatherLocation()

  const now = new Date()
  const dateStr = now.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  })

  const upcomingItem = (upcoming ?? [])[0] ?? null
  const quickAddErrorMessage = quickAddError ?? (createMutation.isError
    ? (createMutation.error instanceof Error ? createMutation.error.message : "일정 생성 중 오류")
    : null)

  return (
    <div className="space-y-6">
      <div className="pt-2 md:pt-4">
        <h2 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">
          {getGreeting()}, Tak.
        </h2>
        <div className="mt-1">
          <WeatherInline />
        </div>
        <p className="text-zinc-500 text-sm mt-1">
          {dateStr}{weatherLocation && <span className="ml-2 text-zinc-600">· {weatherLocation}</span>}
        </p>
      </div>

      {/* 오늘 일정 */}
      <div>
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
            오늘 일정
          </h3>
        </div>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full bg-zinc-800" />
            <Skeleton className="h-16 w-full bg-zinc-800" />
          </div>
        ) : error ? (
          <p className="text-red-400 text-sm">일정을 불러오지 못했습니다.</p>
        ) : (schedules ?? []).length === 0 ? (
          <p className="text-zinc-500 text-sm">오늘 일정이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {(schedules ?? []).map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-zinc-100 text-sm font-medium truncate">{item.title}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
                    <span>{formatTimeRange(item.start, item.end)}</span>
                    {item.location && <span className="truncate">- {item.location}</span>}
                  </div>
                </div>
                <Badge variant="outline" className="border-zinc-600 text-zinc-300">
                  {sourceLabel(item.source)}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 다가오는 일정 */}
      {upcomingItem && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
            다가오는 일정
          </h3>
          <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-zinc-100 text-sm font-medium truncate">{upcomingItem.title}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
                <span>{formatUpcomingDate(upcomingItem.start)}</span>
                {upcomingItem.start.includes("T") && (
                  <span>{formatTimeRange(upcomingItem.start, upcomingItem.end)}</span>
                )}
                {upcomingItem.location && <span className="truncate">- {upcomingItem.location}</span>}
              </div>
            </div>
            <Badge variant="outline" className="border-zinc-600 text-zinc-300">
              {sourceLabel(upcomingItem.source)}
            </Badge>
          </div>
        </div>
      )}

      {/* 빠른 일정 추가 */}
      <form onSubmit={handleQuickAdd} className="flex gap-2">
        <Input
          value={quickName}
          onChange={(e) => setQuickName(e.target.value)}
          placeholder="자연어로 일정 추가 (예: 오늘 봉산짬뽕에서 점심 식사)"
          className="bg-zinc-800 border-zinc-700 text-zinc-100"
          disabled={createMutation.isPending}
        />
        <Button
          type="submit"
          size="sm"
          disabled={createMutation.isPending}
          className="bg-blue-600 hover:bg-blue-500 text-white"
        >
          {createMutation.isPending ? "파싱 중..." : "추가"}
        </Button>
      </form>
      {quickAddErrorMessage && (
        <p className="-mt-4 text-xs text-red-300">오류: {quickAddErrorMessage}</p>
      )}
    </div>
  )
}
