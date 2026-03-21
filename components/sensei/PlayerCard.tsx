"use client"

import type { Archetype } from "@/lib/types/sensei"
import { Badge } from "@/components/ui/badge"
import { AthleteAvatar } from "./AthleteAvatar"
import { calculateOvr } from "@/lib/sensei/ovr"

interface PlayerCardProps {
  archetype: Archetype
  isSelected: boolean
  onClick: () => void
}

const CATEGORY_BADGE: Record<string, { label: string; color: string }> = {
  "gi-legend": { label: "Gi Legend", color: "#a855f7" },
  "gi-active": { label: "Gi Active", color: "#22c55e" },
  "nogi": { label: "No-Gi", color: "#3b82f6" },
  "special": { label: "Special", color: "#f59e0b" },
}

export function PlayerCard({ archetype, isSelected, onClick }: PlayerCardProps) {
  const { ovr, role } = calculateOvr(archetype.stats)
  const badge = CATEGORY_BADGE[archetype.category] || CATEGORY_BADGE["gi-legend"]

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        w-full text-left rounded-xl p-3 border transition-all
        ${isSelected
          ? "border-orange-500/60 bg-orange-500/5 ring-1 ring-orange-500/30"
          : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
        }
      `}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <AthleteAvatar name={archetype.name} imageUrl={archetype.imageUrl} size={44} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-bold text-white">{archetype.flag} {archetype.name}</span>
            <span className="text-xs font-black text-zinc-400">{ovr}</span>
          </div>
          <p className="text-[10px] text-zinc-500">&ldquo;{archetype.nickname}&rdquo; — {archetype.team}</p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            <Badge
              variant="outline"
              className="text-[8px]"
              style={{ borderColor: `${badge.color}40`, color: badge.color }}
            >
              {badge.label}
            </Badge>
            <Badge variant="outline" className="text-[8px] border-zinc-600 text-zinc-400">
              {archetype.playstyle}
            </Badge>
            <span className="text-[8px] text-zinc-600">{role}</span>
          </div>
        </div>
      </div>
    </button>
  )
}
