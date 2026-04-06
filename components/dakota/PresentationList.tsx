"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Skeleton } from "@/components/ui/skeleton"
import { PresentationCard } from "./PresentationCard"
import type { PresentationsResponse, TimeFilter, AttendanceFilter } from "@/lib/types/presentation"

const TIME_OPTIONS: { value: TimeFilter; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
]

const ATTENDANCE_OPTIONS: { value: AttendanceFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "발표", label: "발표" },
  { value: "참석", label: "참석" },
  { value: "불참", label: "불참" },
  { value: "미정", label: "미정" },
]

function FilterButton<T extends string>({
  value,
  current,
  label,
  onChange,
}: {
  value: T
  current: T
  label: string
  onChange: (v: T) => void
}) {
  const active = value === current
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`px-3 py-1 text-xs rounded-md transition-colors ${
        active
          ? "bg-zinc-700 text-zinc-100"
          : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60"
      }`}
    >
      {label}
    </button>
  )
}

export function PresentationList() {
  const [time, setTime] = useState<TimeFilter>("upcoming")
  const [attendance, setAttendance] = useState<AttendanceFilter>("all")

  const params = new URLSearchParams()
  params.set("time", time)
  if (attendance !== "all") params.set("attendance", attendance)
  const qs = params.toString()

  const { data, isLoading, error, refetch } = useQuery<PresentationsResponse>({
    queryKey: ["dakota", "presentations", time, attendance],
    queryFn: async () => {
      const res = await fetch(`/api/dakota/presentations${qs ? `?${qs}` : ""}`)
      if (!res.ok) throw new Error("일정 조회 실패")
      return res.json()
    },
    staleTime: 2 * 60 * 1000,
  })

  const presentations = data?.presentations ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-0.5 bg-zinc-800/50 rounded-lg p-0.5 border border-zinc-800">
          {TIME_OPTIONS.map((o) => (
            <FilterButton key={o.value} value={o.value} current={time} label={o.label} onChange={setTime} />
          ))}
        </div>
        <div className="flex items-center gap-0.5 bg-zinc-800/50 rounded-lg p-0.5 border border-zinc-800">
          {ATTENDANCE_OPTIONS.map((o) => (
            <FilterButton key={o.value} value={o.value} current={attendance} label={o.label} onChange={setAttendance} />
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full bg-zinc-800 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-400 text-sm mb-3">
            로딩 실패: {(error as Error).message}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-4 py-2 rounded-lg text-sm bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 transition-colors"
          >
            다시 시도
          </button>
        </div>
      ) : presentations.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-zinc-500 text-sm">해당 조건의 일정이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {presentations.map((p) => (
            <PresentationCard key={p.page_id} presentation={p} />
          ))}
          <p className="text-zinc-600 text-xs text-right">{presentations.length}건</p>
        </div>
      )}
    </div>
  )
}
