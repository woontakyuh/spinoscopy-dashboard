"use client"

import { useState } from "react"
import { PROMOTION_HISTORY } from "@/lib/sensei/stats"
import { BELTS } from "./statConfig"

function getClipPath(i: number, len: number) {
  if (i === 0) return "polygon(0% 0%, calc(100% - 1.5rem) 0%, 100% 50%, calc(100% - 1.5rem) 100%, 0% 100%)"
  if (i === len - 1) return "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 1.5rem 50%)"
  return "polygon(0% 0%, calc(100% - 1.5rem) 0%, 100% 50%, calc(100% - 1.5rem) 100%, 0% 100%, 1.5rem 50%)"
}

function getStripesForBelt(belt: string) {
  const entries = PROMOTION_HISTORY.filter((p) => p.belt === belt)
  return { reached: entries.length > 0 ? Math.max(...entries.map((e) => e.stripes)) : 0 }
}

function getPromoDate(belt: string, stripe: number): string | undefined {
  return PROMOTION_HISTORY.find((p) => p.belt === belt && p.stripes === stripe)?.date
}

interface BeltTimelineProps {
  belt: string
  stripes: number
}

/** 벨트 승급 타임라인 (chevron + 승급날짜 툴팁) */
export function BeltTimeline({ belt, stripes }: BeltTimelineProps) {
  const [hoveredBelt, setHoveredBelt] = useState<{ belt: string; stripe: number } | null>(null)
  const currentBeltIdx = BELTS.findIndex((b) => b.id === belt)

  return (
    <div className="flex items-center h-11 relative w-full gap-0.5">
      {BELTS.map((b, idx) => {
        const isPast = currentBeltIdx >= idx
        const isCur = b.id === belt
        const filled = isPast ? (isCur ? stripes : getStripesForBelt(b.id).reached) : 0
        return (
          <div key={b.id} className={`relative h-full flex-1 ${b.color} ${!isPast ? "opacity-30 grayscale" : ""}`} style={{ clipPath: getClipPath(idx, BELTS.length) }}>
            <div className="absolute inset-0 flex items-center">
              {[0,1,2,3,4].map((si) => (
                <div key={si} className="flex-1 flex items-center justify-center h-full" style={{ minWidth: 14 }}
                  onMouseEnter={() => isPast && setHoveredBelt({ belt: b.id, stripe: si })}
                  onMouseLeave={() => setHoveredBelt(null)}>
                  {si === 0
                    ? <div className={`w-1.5 h-1.5 rounded-full ${isPast && si <= filled ? "bg-white" : "bg-muted"}`}/>
                    : <div className={`w-1 h-[50%] rounded-sm ${isPast && si <= filled ? "bg-white" : "bg-muted/50"}`}/>}
                </div>
              ))}
            </div>
          </div>
        )
      })}
      {hoveredBelt && (() => {
        const d = hoveredBelt.stripe === 0
          ? getPromoDate(hoveredBelt.belt, 0) || PROMOTION_HISTORY.find((p) => p.belt === hoveredBelt.belt)?.date
          : getPromoDate(hoveredBelt.belt, hoveredBelt.stripe)
        const bi = BELTS.findIndex((b) => b.id === hoveredBelt.belt)
        const pct = (bi + (hoveredBelt.stripe + 0.5) / 5) / BELTS.length * 100
        return (
          <div className="absolute top-[-40px] bg-muted text-[10px] px-2 py-1 rounded border border-border z-20 pointer-events-none whitespace-nowrap" style={{ left: `${pct}%`, transform: "translateX(-50%)" }}>
            {hoveredBelt.stripe === 0 ? `${hoveredBelt.belt} 승급` : `${hoveredBelt.belt} ${hoveredBelt.stripe}그랄`}
            {d && <span className="ml-1 text-muted-foreground">{d}</span>}
          </div>
        )
      })()}
    </div>
  )
}
