"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { TAG_CATEGORIES } from "@/lib/ai/bjjTags"
import type { TagCategory } from "@/lib/ai/bjjTags"
import type { BjjStats } from "@/lib/types/sensei"

const CATEGORY_COLORS: Record<string, string> = {
  Guard: "#a855f7",
  Passing: "#22c55e",
  Control: "#f97316",
  Finishing: "#ef4444",
  Takedowns: "#06b6d4",
  LegLocks: "#eab308",
}

function getSkillLevel(count: number): { level: number; label: string } {
  if (count === 0) return { level: 0, label: "Locked" }
  if (count <= 2) return { level: 1, label: "Lv.1" }
  if (count <= 5) return { level: 2, label: "Lv.2" }
  if (count <= 10) return { level: 3, label: "Lv.3" }
  if (count <= 20) return { level: 4, label: "Lv.4" }
  return { level: 5, label: "Lv.5" }
}

interface StatsResponse {
  stats: BjjStats
  tagFrequencies: Record<string, number>
}

export function SenseiSkillTree() {
  const [selectedCategory, setSelectedCategory] = useState<TagCategory | "all">("all")

  const { data, isLoading, isError, error } = useQuery<StatsResponse>({
    queryKey: ["sensei-stats"],
    queryFn: async () => {
      const res = await fetch("/api/notion/sensei/stats")
      if (!res.ok) throw new Error("스탯 조회 실패")
      return res.json()
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 bg-muted rounded-lg" />
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    )
  }

  if (isError) {
    return <p className="text-red-400 text-sm">오류: {(error as Error).message}</p>
  }

  if (!data) return null

  const { tagFrequencies } = data
  const categories = Object.entries(TAG_CATEGORIES).filter(([cat]) => cat !== "Meta") as [TagCategory, Record<string, string>][]

  const filteredCategories = selectedCategory === "all"
    ? categories
    : categories.filter(([cat]) => cat === selectedCategory)

  return (
    <div className="space-y-4">
      {/* Category Filter */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setSelectedCategory("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            selectedCategory === "all"
              ? "bg-muted text-foreground"
              : "bg-muted/50 text-muted-foreground hover:text-foreground/90"
          }`}
        >
          All
        </button>
        {categories.map(([cat]) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedCategory === cat
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground/90"
            }`}
            style={selectedCategory === cat ? {
              background: `${CATEGORY_COLORS[cat]}20`,
              border: `1px solid ${CATEGORY_COLORS[cat]}40`,
            } : {
              background: "var(--muted)",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Skill Nodes */}
      {filteredCategories.map(([categoryName, tags]) => {
        const color = CATEGORY_COLORS[categoryName]
        const tagEntries = Object.entries(tags)
        const unlockedCount = tagEntries.filter(([abbr]) => (tagFrequencies[abbr] || 0) > 0).length
        const totalCount = tagEntries.length
        const unlockPct = Math.round((unlockedCount / totalCount) * 100)

        return (
          <div key={categoryName} className="border border-border rounded-xl p-4 bg-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium" style={{ color }}>
                {categoryName}
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">
                  {unlockedCount}/{totalCount} 해금
                </span>
                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${unlockPct}%`, background: color }}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {tagEntries.map(([abbr, fullName]) => {
                const count = tagFrequencies[abbr] || 0
                const { level, label } = getSkillLevel(count)
                const isLocked = level === 0
                const isMaxed = level === 5

                return (
                  <div
                    key={abbr}
                    className={`
                      relative rounded-lg p-2.5 border transition-all
                      ${isLocked
                        ? "border-border bg-card/50 opacity-40"
                        : isMaxed
                          ? "border-current bg-current/5"
                          : "border-border bg-muted/50"
                      }
                    `}
                    style={!isLocked ? { borderColor: `${color}${isMaxed ? "80" : "30"}` } : undefined}
                  >
                    {isMaxed && (
                      <div
                        className="absolute inset-0 rounded-lg pointer-events-none"
                        style={{
                          boxShadow: `0 0 12px ${color}30, inset 0 0 12px ${color}10`,
                        }}
                      />
                    )}
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`text-xs font-mono font-bold ${isLocked ? "text-muted-foreground/70" : ""}`}
                        style={!isLocked ? { color } : undefined}
                      >
                        {abbr}
                      </span>
                      <span className={`text-[9px] ${isLocked ? "text-zinc-700" : "text-muted-foreground"}`}>
                        {isLocked ? "🔒" : label}
                      </span>
                    </div>
                    <p className={`text-[9px] mt-0.5 ${isLocked ? "text-zinc-700" : "text-muted-foreground"}`}>
                      {fullName}
                    </p>
                    {!isLocked && (
                      <div className="flex items-center gap-1 mt-1.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <div
                            key={`${abbr}-dot-${String(i)}`}
                            className="h-1 flex-1 rounded-full"
                            style={{
                              background: i < level ? color : "#27272a",
                            }}
                          />
                        ))}
                        <span className="text-[8px] text-muted-foreground/70 ml-0.5">{count}회</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
