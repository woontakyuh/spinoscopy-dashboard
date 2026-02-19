import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type { ScheduleItem } from "@/lib/types/schedule"

const CATEGORY_COLORS: Record<string, string> = {
  Conf: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Spine: "bg-green-500/10 text-green-400 border-green-500/20",
  AI: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Workshop: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Lecture: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  Meeting: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  Webinar: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
}

function getDaysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ""
  return new Date(dateStr).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
    weekday: "short",
  })
}

interface ScheduleCardProps {
  item: ScheduleItem
  compact?: boolean
}

export function ScheduleCard({ item, compact = false }: ScheduleCardProps) {
  const daysUntil = getDaysUntil(item.date_start)
  const categoryColor = CATEGORY_COLORS[item.category] ?? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"

  const daysLabel =
    daysUntil === null
      ? ""
      : daysUntil === 0
      ? "오늘"
      : daysUntil < 0
      ? `${Math.abs(daysUntil)}일 전`
      : `D-${daysUntil}`

  return (
    <Card className={`bg-zinc-800 border-zinc-700 hover:border-zinc-600 transition-colors ${compact ? "py-0" : ""}`}>
      <CardContent className={compact ? "p-3" : "p-4"}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium text-sm truncate">{item.name}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-zinc-400 text-xs">
                📅 {formatDate(item.date_start)}
                {item.date_end && item.date_end !== item.date_start
                  ? ` – ${formatDate(item.date_end)}`
                  : ""}
              </span>
              {item.place && (
                <span className="text-zinc-500 text-xs">📍 {item.place}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {daysLabel && (
              <span className={`text-xs font-semibold ${daysUntil === 0 ? "text-green-400" : daysUntil && daysUntil <= 7 ? "text-yellow-400" : "text-zinc-400"}`}>
                {daysLabel}
              </span>
            )}
            {item.category && (
              <Badge variant="outline" className={`text-xs ${categoryColor}`}>
                {item.category}
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
