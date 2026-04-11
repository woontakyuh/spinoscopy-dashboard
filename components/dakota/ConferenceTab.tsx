"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import type { Presentation, PresentationsResponse, TimeFilter } from "@/lib/types/presentation"

function attendanceBadge(type: string) {
  switch (type) {
    case "발표":
      return { label: "발표", className: "border-amber-400/60 text-amber-300 bg-amber-500/10" }
    case "참석":
      return { label: "참석", className: "border-green-400/60 text-green-300 bg-green-500/10" }
    case "불참":
      return { label: "불참", className: "border-red-400/50 text-red-300/70 bg-red-500/5" }
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
  const opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric", weekday: "short" }
  const startFmt = new Date(s + "T00:00:00+09:00").toLocaleDateString("ko-KR", opts)
  if (end && end.slice(0, 10) !== s) {
    const endFmt = new Date(end.slice(0, 10) + "T00:00:00+09:00").toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
    return `${startFmt} ~ ${endFmt}`
  }
  return startFmt
}

function ConferenceRow({ conf, showDday }: { conf: Presentation; showDday: boolean }) {
  const badge = attendanceBadge(conf.attendance_type)
  const dday = showDday ? dDayLabel(conf.date_start) : null
  const isPresenting = conf.attendance_type === "발표"

  return (
    <a
      href={conf.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-start gap-3 bg-muted border border-border rounded-lg px-4 py-3 hover:border-border card-hover"
    >
      {/* D-day (upcoming only) */}
      {showDday && (
        <div className="w-12 shrink-0 text-center pt-0.5">
          {dday ? (
            <span className={`text-xs font-mono font-medium ${dday.color}`}>{dday.text}</span>
          ) : (
            <span className="text-xs text-muted-foreground">--</span>
          )}
        </div>
      )}

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
        {conf.society.length > 0 && (
          <div className="flex gap-1 mt-1">
            {conf.society.map((s) => (
              <span key={s} className="text-[10px] text-muted-foreground/70 bg-muted border border-border rounded px-1.5 py-0">
                {s}
              </span>
            ))}
          </div>
        )}
        {isPresenting && conf.topic && (
          <p className="text-xs text-amber-300/90 mt-1">
            📢 {conf.topic}
          </p>
        )}
        {conf.abstract_deadline && (
          <p className="text-[10px] text-red-400/80 mt-0.5">
            초록 마감: {conf.abstract_deadline.slice(0, 10)}
          </p>
        )}
      </div>
    </a>
  )
}

const TIME_LABELS: { value: TimeFilter; label: string }[] = [
  { value: "upcoming", label: "다가오는 학회" },
  { value: "past", label: "지난 학회" },
]

export function ConferenceTab() {
  const [time, setTime] = useState<TimeFilter>("upcoming")

  const { data, isLoading, error, refetch } = useQuery<PresentationsResponse>({
    queryKey: ["dakota-conferences", time],
    queryFn: async () => {
      const res = await fetch(`/api/dakota/presentations?time=${time}`)
      if (!res.ok) throw new Error("학회 일정 조회 실패")
      return res.json()
    },
    staleTime: 2 * 60 * 1000,
  })

  const conferences = data?.presentations ?? []

  return (
    <div className="space-y-4">
      {/* Time toggle */}
      <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-0.5 border border-border w-fit">
        {TIME_LABELS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setTime(o.value)}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              time === o.value
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground/90 hover:bg-muted/60"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full bg-muted rounded-xl" />
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
            className="px-4 py-2 rounded-lg text-sm bg-muted text-foreground/90 border border-border hover:bg-muted transition-colors"
          >
            다시 시도
          </button>
        </div>
      ) : conferences.length === 0 ? (
        <EmptyState
          icon="🏆"
          message={time === "upcoming" ? "다가오는 학회 일정이 없습니다." : "지난 학회 기록이 없습니다."}
        />
      ) : (
        <div className="space-y-2">
          {conferences.map((conf) => (
            <ConferenceRow key={conf.page_id} conf={conf} showDday={time === "upcoming"} />
          ))}
          <p className="text-muted-foreground/70 text-xs text-right">{conferences.length}건</p>
        </div>
      )}
    </div>
  )
}
