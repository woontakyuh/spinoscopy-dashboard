"use client"

import { Badge } from "@/components/ui/badge"
import { calculateDday, getDdayColor } from "@/lib/utils/dday"
import type { Presentation } from "@/lib/types/maestro"

interface PresentationCardProps {
  presentation: Presentation
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return "날짜 미정"
  if (!end || start === end) return start
  return `${start} ~ ${end}`
}

export function PresentationCard({ presentation }: PresentationCardProps) {
  const dday = calculateDday(presentation.date_start)
  const ddayColor = getDdayColor(dday)
  const abstractDday = presentation.abstract_deadline
    ? calculateDday(presentation.abstract_deadline)
    : null

  return (
    <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900 hover:border-zinc-600 transition-colors presentation-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
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
                className="text-[10px] px-1.5 py-0 h-5 border-zinc-600 text-zinc-400"
              >
                {presentation.category}
              </Badge>
            )}
          </div>

          <p className="text-zinc-200 text-sm font-medium leading-snug">
            {presentation.topic || presentation.name}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            <span>📅 {formatDateRange(presentation.date_start, presentation.date_end)}</span>
            {presentation.place && <span>📍 {presentation.place}</span>}
            {presentation.preparation_status && (
              <span className="text-zinc-400">⚙️ {presentation.preparation_status}</span>
            )}
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
        <a
          href={presentation.link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-3 text-xs text-blue-400 hover:text-blue-300 hover:underline"
        >
          🔗 학회 링크
        </a>
      )}
    </div>
  )
}
