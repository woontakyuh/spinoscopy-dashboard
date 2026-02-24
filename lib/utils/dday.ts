import type { DdayInfo } from "@/lib/types/maestro"

export function calculateDday(targetDate: string | null): DdayInfo {
  if (!targetDate) {
    return { days: null, label: "날짜 미정", isPast: false }
  }

  const parts = targetDate.split("-").map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return { days: null, label: "날짜 미정", isPast: false }
  }
  const [ty, tm, td] = parts
  const now = new Date()
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const targetUTC = Date.UTC(ty, tm - 1, td)

  const diffMs = targetUTC - todayUTC
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return { days: 0, label: "D-DAY", isPast: false }
  }

  if (diffDays > 0) {
    return { days: diffDays, label: `D-${diffDays}`, isPast: false }
  }

  return { days: diffDays, label: `D+${Math.abs(diffDays)}`, isPast: true }
}

export function getDdayColor(info: DdayInfo): string {
  if (info.days === null) return "bg-zinc-700 text-zinc-400 border-zinc-600"
  if (info.isPast) return "bg-zinc-700/60 text-zinc-500 border-zinc-600"
  if (info.days === 0) return "bg-red-500/20 text-red-400 border-red-500/40"
  if (info.days <= 7) return "bg-amber-500/20 text-amber-400 border-amber-500/40"
  if (info.days <= 30) return "bg-cyan-500/20 text-cyan-400 border-cyan-500/40"
  return "bg-zinc-700/40 text-zinc-400 border-zinc-600"
}
