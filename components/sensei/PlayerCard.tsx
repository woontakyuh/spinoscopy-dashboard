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
          ? "border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.05)]"
          : "border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.12)]"
        }
      `}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <AthleteAvatar name={archetype.name} imageUrl={archetype.imageUrl} size={44} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13px] font-semibold text-white">{archetype.flag} {archetype.name}</span>
            <span className="text-[12px] font-semibold text-[rgba(255,255,255,0.5)]">{ovr}</span>
          </div>
          <p className="text-[11px] text-[rgba(255,255,255,0.25)]">&ldquo;{archetype.nickname}&rdquo; — {archetype.team}</p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            <Badge
              variant="outline"
              className="text-[11px]"
              style={{ borderColor: `${badge.color}20`, color: badge.color, background: `${badge.color}12` }}
            >
              {badge.label}
            </Badge>
            <Badge variant="outline" className="text-[11px] border-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.5)]">
              {archetype.playstyle}
            </Badge>
            <span className="text-[11px] text-[rgba(255,255,255,0.25)]">{role}</span>
          </div>
        </div>
      </div>
    </button>
  )
}
