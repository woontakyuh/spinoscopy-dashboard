"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
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

async function fetchSchedule(): Promise<DashboardScheduleItem[]> {
  const res = await fetch("/api/dashboard/schedule")
  if (!res.ok) throw new Error("일정 로딩 실패")
  return res.json()
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

function sourceLabel(source: DashboardScheduleItem["source"]): string {
  if (source === "both") return "Both"
  if (source === "notion") return "Notion"
  return "GCal"
}

export function MorningBriefing() {
  const { data: schedules, isLoading, error } = useQuery({
    queryKey: ["dashboard-schedule"],
    queryFn: fetchSchedule,
    refetchInterval: 60000,
  })

  const now = new Date()
  const dateStr = now.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">
          {getGreeting()}, Dr. Yuh
        </h2>
        <p className="text-zinc-400 mt-1">{dateStr}</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
            오늘 일정
          </h3>
          <Link href="/agents/jarvis" className="text-xs text-blue-300 hover:text-blue-200">
            일정 추가
          </Link>
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
    </div>
  )
}
