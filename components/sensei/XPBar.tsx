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
        <span className="text-[11px] text-foreground/25">
          Lv.{level} → Lv.{level + 1}
        </span>
        <span className="text-[11px] text-foreground/25 tabular-nums">
          {current} / {total} XP
        </span>
      </div>
      <div className="h-[8px] rounded-[4px] overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full rounded-[4px] transition-all duration-500 ease-out"
          style={{ width: `${pct}%`, background: "#3b82f6" }}
        />
      </div>
    </div>
  )
}
