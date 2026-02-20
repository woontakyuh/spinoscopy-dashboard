"use client"

import { useQuery } from "@tanstack/react-query"
import { Skeleton } from "@/components/ui/skeleton"
import type { ScheduleItem } from "@/lib/types/schedule"

const SURGERY_CATEGORIES = ["수술", "surgery", "op", "spine", "OR"]

function isSurgery(item: ScheduleItem): boolean {
  const cat = item.category.toLowerCase()
  const name = item.name.toLowerCase()
  return SURGERY_CATEGORIES.some(
    (k) => cat.includes(k.toLowerCase()) || name.includes(k.toLowerCase())
  )
}

function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false
  return dateStr.slice(0, 10) === new Date().toISOString().slice(0, 10)
}

async function fetchSchedule(): Promise<ScheduleItem[]> {
  const res = await fetch("/api/notion/schedule")
  if (!res.ok) throw new Error("일정 로딩 실패")
  return res.json()
}

export function TodaySurgery() {
  const { data: schedules, isLoading } = useQuery({
    queryKey: ["schedule"],
    queryFn: fetchSchedule,
    refetchInterval: 60000,
  })

  const todaySurgeries = (schedules ?? []).filter(
    (s) => isToday(s.date_start) && isSurgery(s)
  )

  if (isLoading) {
    return (
      <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">🏥 오늘 수술</h3>
        <Skeleton className="h-12 w-full bg-zinc-800" />
      </div>
    )
  }

  if (todaySurgeries.length === 0) return null

  return (
    <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
      <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
        🏥 오늘 수술 ({todaySurgeries.length})
      </h3>
      <div className="space-y-2">
        {todaySurgeries.map((s) => (
          <div
            key={s.page_id}
            className="flex items-center gap-3 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3"
          >
            <div className="w-10 h-10 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center text-lg shrink-0">
              🔪
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{s.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {s.place && (
                  <span className="text-zinc-500 text-xs">📍 {s.place}</span>
                )}
                {s.status && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    s.status === "완료" ? "bg-green-500/10 text-green-400" :
                    s.status === "진행중" ? "bg-blue-500/10 text-blue-400" :
                    "bg-zinc-700 text-zinc-400"
                  }`}>
                    {s.status}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
