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
          ? "border-border bg-foreground/5"
          : "border-border bg-foreground/5 hover:border-border"
        }
      `}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <AthleteAvatar name={archetype.name} imageUrl={archetype.imageUrl} size={44} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13px] font-semibold text-foreground">{archetype.flag} {archetype.name}</span>
            <span className="text-[12px] font-semibold text-muted-foreground">{ovr}</span>
          </div>
          <p className="text-[11px] text-muted-foreground/70">&ldquo;{archetype.nickname}&rdquo; — {archetype.team}</p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            <Badge
              variant="outline"
              className="text-[11px]"
              style={{ borderColor: `${badge.color}20`, color: badge.color, background: `${badge.color}12` }}
            >
              {badge.label}
            </Badge>
            <Badge variant="outline" className="text-[11px] border-border text-muted-foreground">
              {archetype.playstyle}
            </Badge>
            <span className="text-[11px] text-muted-foreground/70">{role}</span>
          </div>
        </div>
      </div>
    </button>
  )
}
