"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { ARCHETYPES } from "@/lib/sensei/archetypes"
import { calculateOvr } from "@/lib/sensei/ovr"
import { RadarChart } from "./RadarChart"
import { StatBar } from "./StatBar"
import { PlayerCard } from "./PlayerCard"
import { AthleteAvatar } from "./AthleteAvatar"
import { GameplanFlow } from "./GameplanFlow"
import type { Archetype, BjjStats } from "@/lib/types/sensei"

type CategoryFilter = "all" | "gi-legend" | "gi-active" | "nogi" | "special"

const FILTERS: { id: CategoryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "gi-legend", label: "Gi Legends" },
  { id: "gi-active", label: "Gi Active" },
  { id: "nogi", label: "No-Gi" },
  { id: "special", label: "Special" },
]

const ATTR_COLORS = {
  guard: "#a855f7",
  passing: "#22c55e",
  control: "#f97316",
  finishing: "#ef4444",
  takedowns: "#06b6d4",
  legLocks: "#eab308",
}

const ATTR_LABELS = {
  guard: "Guard",
  passing: "Passing",
  control: "Control",
  finishing: "Finishing",
  takedowns: "Takedowns",
  legLocks: "Leg Locks",
}

interface StatsResponse {
  stats: BjjStats
  tagFrequencies: Record<string, number>
}

export function SenseiHeroes() {
  const [filter, setFilter] = useState<CategoryFilter>("all")
  const [selected, setSelected] = useState<Archetype | null>(null)

  const { data } = useQuery<StatsResponse>({
    queryKey: ["sensei-stats"],
    queryFn: async () => {
      const res = await fetch("/api/notion/sensei/stats")
      if (!res.ok) throw new Error("스탯 조회 실패")
      return res.json()
    },
  })

  const myStats = data?.stats ?? null

  const filtered = filter === "all"
    ? ARCHETYPES
    : ARCHETYPES.filter((a) => a.category === filter)

  return (
    <div className="space-y-4">
      {/* Category Toggle */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => { setFilter(f.id); setSelected(null) }}
            className={`px-3 py-1.5 rounded-xl text-[12px] font-medium transition-colors ${
              filter === f.id
                ? "bg-[rgba(255,255,255,0.05)] text-foreground"
                : "bg-[rgba(255,255,255,0.03)] text-[rgba(255,255,255,0.25)] hover:text-[rgba(255,255,255,0.5)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Player Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {filtered.map((arch) => (
          <PlayerCard
            key={arch.name}
            archetype={arch}
            isSelected={selected?.name === arch.name}
            onClick={() => setSelected((prev) => prev?.name === arch.name ? null : arch)}
          />
        ))}
      </div>

      {/* Selected Player Detail */}
      {selected && (
        <div className="border border-[rgba(255,255,255,0.06)] rounded-xl p-5 bg-[rgba(255,255,255,0.03)] space-y-4">
          <div className="flex items-start gap-4">
            <AthleteAvatar name={selected.name} imageUrl={selected.imageUrl} size={56} />
            <div className="flex-1">
              <h3 className="text-[16px] font-semibold text-foreground">
                {selected.flag} {selected.name}
              </h3>
              <p className="text-[12px] text-[rgba(255,255,255,0.25)]">
                &ldquo;{selected.nickname}&rdquo; — {selected.team}
              </p>
            </div>
            <div className="text-center shrink-0">
              <div className="text-[24px] font-semibold text-foreground">{calculateOvr(selected.stats).ovr}</div>
              <p className="text-[11px] text-[rgba(255,255,255,0.25)]">{calculateOvr(selected.stats).role}</p>
            </div>
          </div>

          {/* Bio & Style */}
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-[11px] border-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.5)]">
              {selected.playstyle}
            </Badge>
            {selected.styleReferences?.map((ref) => (
              <Badge key={ref} variant="outline" className="text-[11px] border-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.25)]">
                Style: {ref}
              </Badge>
            ))}
          </div>

          {selected.bio && (
            <p className="text-[12px] text-[rgba(255,255,255,0.5)]">{selected.bio}</p>
          )}

          {/* Radar: Player vs Me */}
          <div>
            <h4 className="text-[12px] text-[rgba(255,255,255,0.5)] mb-1">
              {selected.name} vs 나
            </h4>
            <RadarChart
              attributes={selected.stats}
              compareAttributes={myStats?.combined.attributes ?? null}
              compareName="Me"
              maxDomain={40}
            />
          </div>

          {/* Stat Bars */}
          <div className="space-y-2">
            {(Object.keys(ATTR_LABELS) as (keyof typeof ATTR_LABELS)[]).map((key) => (
              <div key={key} className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[rgba(255,255,255,0.25)]">{ATTR_LABELS[key]}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono" style={{ color: ATTR_COLORS[key] }}>
                      {selected.stats[key]}
                    </span>
                    {myStats && (
                      <span className={`text-[11px] font-mono ${
                        myStats.combined.attributes[key] >= selected.stats[key] ? "text-[#22c55e]" : "text-[rgba(255,255,255,0.25)]"
                      }`}>
                        ({myStats.combined.attributes[key] >= selected.stats[key] ? "+" : ""}{myStats.combined.attributes[key] - selected.stats[key]})
                      </span>
                    )}
                  </div>
                </div>
                <StatBar label="" value={selected.stats[key]} color={ATTR_COLORS[key]} />
              </div>
            ))}
          </div>

          {/* Signature Tags */}
          <div>
            <h4 className="text-[12px] text-[rgba(255,255,255,0.5)] mb-1.5">시그니처 태그</h4>
            <div className="flex flex-wrap gap-1">
              {selected.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-[11px] border-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.5)]">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          {/* Gameplan Flow */}
          {selected.gameplan.length > 0 && (
            <div className="border-t border-[rgba(255,255,255,0.06)] pt-3">
              <GameplanFlow gameplan={selected.gameplan} playerName={selected.name} />
            </div>
          )}

          {/* My Position Analysis */}
          {myStats && (
            <div className="border-t border-[rgba(255,255,255,0.06)] pt-3">
              <h4 className="text-[12px] text-[rgba(255,255,255,0.5)] mb-2">나의 현재 위치</h4>
              {(() => {
                const diffs = (Object.keys(ATTR_LABELS) as (keyof typeof ATTR_LABELS)[]).map((key) => ({
                  key,
                  diff: myStats.combined.attributes[key] - selected.stats[key],
                  label: ATTR_LABELS[key],
                }))
                const strengths = diffs.filter((d) => d.diff >= 0).sort((a, b) => b.diff - a.diff)
                const weaknesses = diffs.filter((d) => d.diff < 0).sort((a, b) => a.diff - b.diff)
                const similarity = Math.round(
                  100 - (Math.sqrt(diffs.reduce((sum, d) => sum + d.diff ** 2, 0)) / Math.sqrt(6 * 100 ** 2)) * 100
                )

                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-[rgba(255,255,255,0.25)]">유사도:</span>
                      <span className="text-[13px] font-semibold text-[#3b82f6]">{similarity}%</span>
                    </div>
                    {strengths.length > 0 && (
                      <div>
                        <span className="text-[11px] text-[#22c55e]">강점: </span>
                        <span className="text-[11px] text-[rgba(255,255,255,0.5)]">
                          {strengths.slice(0, 3).map((s) => `${s.label} (+${s.diff})`).join(", ")}
                        </span>
                      </div>
                    )}
                    {weaknesses.length > 0 && (
                      <div>
                        <span className="text-[11px] text-[#ef4444]">성장 필요: </span>
                        <span className="text-[11px] text-[rgba(255,255,255,0.5)]">
                          {weaknesses.slice(0, 3).map((w) => `${w.label} (${w.diff})`).join(", ")}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
