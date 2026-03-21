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
        <span className="text-xs text-zinc-400">{label}</span>
        <span className="text-xs font-mono font-bold" style={{ color }}>
          {value}
        </span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}88, ${color})`,
          }}
        />
      </div>
    </div>
  )
}
