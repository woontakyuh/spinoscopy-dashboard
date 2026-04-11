"use client"

import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import type { Presentation, PresentationsResponse } from "@/lib/types/presentation"

function attendanceBadge(type: string) {
  switch (type) {
    case "발표":
      return { label: "발표", className: "border-amber-400/60 text-amber-300 bg-amber-500/10" }
    case "Instructor":
      return { label: "Instructor", className: "border-purple-400/60 text-purple-300 bg-purple-500/10" }
    case "참석":
      return { label: "참석", className: "border-green-400/60 text-green-300 bg-green-500/10" }
    default:
      return { label: "미정", className: "border-border text-muted-foreground" }
  }
}

function dDayLabel(dateStr: string | null): { text: string; color: string } | null {
  if (!dateStr) return null
  const target = new Date(dateStr.slice(0, 10) + "T00:00:00+09:00")
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }) + "T00:00:00+09:00")
  const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diff < 0) return { text: `D+${Math.abs(diff)}`, color: "text-zinc-500" }
  if (diff === 0) return { text: "D-Day", color: "text-blue-400 font-bold" }
  if (diff <= 7) return { text: `D-${diff}`, color: "text-amber-400" }
  if (diff <= 30) return { text: `D-${diff}`, color: "text-muted-foreground" }
  return { text: `D-${diff}`, color: "text-muted-foreground/70" }
}

function formatDate(start: string | null, end: string | null): string {
  if (!start) return "날짜 미정"
  const s = start.slice(0, 10)
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", weekday: "short" }
  const startFmt = new Date(s + "T00:00:00+09:00").toLocaleDateString("ko-KR", opts)
  if (end && end.slice(0, 10) !== s) {
    const endFmt = new Date(end.slice(0, 10) + "T00:00:00+09:00").toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
    return `${startFmt} ~ ${endFmt}`
  }
  return startFmt
}

function ConferenceItem({ conf }: { conf: Presentation }) {
  const badge = attendanceBadge(conf.attendance_type)
  const dday = dDayLabel(conf.date_start)
  const isPresenting = conf.attendance_type === "발표" || conf.attendance_type === "Instructor"

  return (
    <a
      href={conf.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-start gap-3 bg-muted border border-border rounded-lg px-4 py-3 hover:border-border card-hover"
    >
      {/* D-day */}
      <div className="w-12 shrink-0 text-center pt-0.5">
        {dday ? (
          <span className={`text-xs font-mono font-medium ${dday.color}`}>{dday.text}</span>
        ) : (
          <span className="text-xs text-muted-foreground">--</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground truncate">{conf.name}</p>
          <Badge variant="outline" className={`shrink-0 text-[10px] px-1.5 py-0 ${badge.className}`}>
            {badge.label}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatDate(conf.date_start, conf.date_end)}
          {conf.place && ` · ${conf.place}`}
        </p>
        {isPresenting && conf.topic && (
          <p className="text-xs text-amber-300/90 mt-1 truncate">
            📢 {conf.topic}
          </p>
        )}
      </div>
    </a>
  )
}

export function ConferenceSchedule() {
  const { data, isLoading, error } = useQuery<PresentationsResponse>({
    queryKey: ["dashboard-conferences"],
    queryFn: async () => {
      const res = await fetch("/api/dakota/presentations?time=upcoming")
      if (!res.ok) throw new Error("학회 일정 로딩 실패")
      return res.json()
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  })

  const conferences = (data?.presentations ?? []).filter((c) => c.attendance_type !== "불참")

  if (isLoading) {
    return (
      <div className="border border-border rounded-xl bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground/90 uppercase tracking-wider mb-3">
          🏆 학회 · 발표 일정
        </h3>
        <div className="space-y-2">
          <Skeleton className="h-14 w-full bg-muted" />
          <Skeleton className="h-14 w-full bg-muted" />
        </div>
      </div>
    )
  }

  return (
    <div className="border border-border rounded-xl bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground/90 uppercase tracking-wider mb-3">
        🏆 학회 · 발표 일정 ({conferences.length})
      </h3>

      {error ? (
        <p className="text-red-400 text-sm">학회 일정을 불러오지 못했습니다.</p>
      ) : conferences.length === 0 ? (
        <EmptyState icon="🏆" message="다가오는 학회 일정이 없습니다." />
      ) : (
        <div className="space-y-2">
          {conferences.slice(0, 6).map((conf) => (
            <ConferenceItem key={conf.page_id} conf={conf} />
          ))}
          {conferences.length > 6 && (
            <p className="text-muted-foreground/60 text-xs text-right">
              +{conferences.length - 6}건 더
            </p>
          )}
        </div>
      )}
    </div>
  )
}
