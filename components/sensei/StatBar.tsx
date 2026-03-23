"use client"

interface StatBarProps {
  label: string
  value: number
  max?: number
  color: string
}

export function StatBar({ label, value, max = 100, color }: StatBarProps) {
  const pct = Math.min(100, (value / max) * 100)

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-white/45">{label}</span>
        <span className="text-[13px] font-semibold tabular-nums" style={{ color }}>
          {value}
        </span>
      </div>
      <div className="h-[6px] rounded-[3px] overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full rounded-[3px] transition-all duration-500 ease-out"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  )
}
