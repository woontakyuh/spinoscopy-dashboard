"use client"

import { Badge } from "@/components/ui/badge"
import { calculateDday, getDdayColor } from "@/lib/utils/dday"
import type { Presentation } from "@/lib/types/presentation"

interface PresentationCardProps {
  presentation: Presentation
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return "날짜 미정"
  if (!end || start === end) return start
  return `${start} ~ ${end}`
}


const ATTENDANCE_STYLE: Record<string, string> = {
  "발표예정": "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  "준비 완료": "border-blue-500/30 bg-blue-500/10 text-blue-400",
  "참석만": "border-border bg-muted text-muted-foreground",
  "불참": "border-border/30 bg-muted/30 text-muted-foreground",
}

export function PresentationCard({ presentation }: PresentationCardProps) {
  const dday = calculateDday(presentation.date_start)
  const ddayColor = getDdayColor(dday)
  const abstractDday = presentation.abstract_deadline
    ? calculateDday(presentation.abstract_deadline)
    : null

  return (
    <a
      href={presentation.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block border border-border rounded-xl p-4 bg-card hover:border-border transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            {presentation.attendance_type && (
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 h-5 ${ATTENDANCE_STYLE[presentation.attendance_type] ?? "border-border text-muted-foreground"}`}
              >
                {presentation.attendance_type}
              </Badge>
            )}
            {presentation.society.map((s) => (
              <Badge
                key={s}
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-5 border-purple-500/30 bg-purple-500/10 text-purple-400"
              >
                {s}
              </Badge>
            ))}
            {presentation.category && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-5 border-border text-muted-foreground"
              >
                {presentation.category}
              </Badge>
            )}
          </div>
          <p className="text-foreground text-sm font-medium leading-snug">
            {presentation.topic || presentation.name}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>📅 {formatDateRange(presentation.date_start, presentation.date_end)}</span>
            {presentation.place && <span>📍 {presentation.place}</span>}
          </div>
          {abstractDday && !abstractDday.isPast && abstractDday.days !== null && (
            <div className="mt-2 text-xs text-amber-400/80">
              📝 초록 마감: {presentation.abstract_deadline} ({abstractDday.label})
            </div>
          )}
        </div>
        <div className="shrink-0">
          <span
            className={`inline-flex items-center justify-center rounded-lg px-2.5 py-1.5 text-xs font-bold border ${ddayColor}`}
          >
            {dday.label}
          </span>
        </div>
      </div>
      {presentation.link && (
        <span className="inline-block mt-3 text-xs text-blue-400">
          🔗 학회 링크
        </span>
      )}
    </a>
  )
}
