"use client"

interface XPBarProps {
  current: number
  total: number
  level: number
}

export function XPBar({ current, total, level }: XPBarProps) {
  const pct = Math.min(100, (current / total) * 100)

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">
          Lv.{level} → Lv.{level + 1}
        </span>
        <span className="text-xs text-zinc-500">
          {current} / {total} XP
        </span>
      </div>
      <div className="h-3 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, #f59e0b, #f97316, #ef4444)",
          }}
        />
      </div>
    </div>
  )
}
