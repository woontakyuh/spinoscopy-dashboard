"use client"

import { useQuery } from "@tanstack/react-query"
import { ScheduleCard } from "./ScheduleCard"
import { Skeleton } from "@/components/ui/skeleton"
import type { ScheduleItem } from "@/lib/types/schedule"

async function fetchSchedule(): Promise<ScheduleItem[]> {
  const res = await fetch("/api/notion/schedule")
  if (!res.ok) throw new Error("일정 로딩 실패")
  return res.json()
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false
  const today = new Date().toISOString().slice(0, 10)
  return dateStr.slice(0, 10) === today
}

export function MorningBriefing() {
  const { data: schedules, isLoading, error } = useQuery({
    queryKey: ["schedule"],
    queryFn: fetchSchedule,
    refetchInterval: 60000,
  })

  const todayItems = (schedules ?? []).filter(s => isToday(s.date_start))
  const upcomingItems = (schedules ?? []).filter(s => !isToday(s.date_start))

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
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
          오늘 일정
        </h3>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full bg-zinc-800" />
            <Skeleton className="h-16 w-full bg-zinc-800" />
          </div>
        ) : error ? (
          <p className="text-red-400 text-sm">일정을 불러오지 못했습니다.</p>
        ) : todayItems.length === 0 ? (
          <p className="text-zinc-500 text-sm">오늘 일정이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {todayItems.map(item => (
              <ScheduleCard key={item.page_id} item={item} />
            ))}
          </div>
        )}
      </div>

      {!isLoading && upcomingItems.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
            이번 주 일정
          </h3>
          <div className="space-y-2">
            {upcomingItems.map(item => (
              <ScheduleCard key={item.page_id} item={item} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
