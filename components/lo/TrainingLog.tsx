"use client"

import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import type { BjjStats, SenseiEntry } from "@/lib/types/sensei"

// Phase 3 Training tab — stats + 12주 frequency bar + recent sessions list.
// 수련 입력(write) UI는 v2 원칙상 제거됨 (모든 write는 claude.ai Lo가 담당).

interface StatsResponse {
  stats: BjjStats
  tagFrequencies: Record<string, number>
}

const TYPE_COLORS: Record<string, string> = {
  class: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  openmat: "bg-green-500/15 text-green-700 dark:text-green-300",
  승급식: "bg-red-500/15 text-red-700 dark:text-red-300",
  study: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  reflection: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  body: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
}

function getWeekKey(date: string): string {
  const d = new Date(date)
  const yearStart = new Date(d.getFullYear(), 0, 1)
  const weekNum = Math.floor((d.getTime() - yearStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`
}

function weekLabel(key: string): string {
  // "2026-W14" → "W14"
  return key.split("-").pop() ?? key
}

export function TrainingLog() {
  const { data: statsData } = useQuery<StatsResponse>({
    queryKey: ["sensei-stats"],
    queryFn: async () => {
      const r = await fetch("/api/notion/sensei/stats")
      if (!r.ok) throw new Error("stats err")
      return r.json()
    },
  })

  const { data: entries } = useQuery<SenseiEntry[]>({
    queryKey: ["sensei-entries"],
    queryFn: async () => {
      const r = await fetch("/api/notion/sensei")
      if (!r.ok) throw new Error("entries err")
      return r.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const stats = statsData?.stats
  const tagFrequencies = statsData?.tagFrequencies ?? {}

  // 최근 12주 bar
  const weeklyBars = useMemo(() => {
    const now = new Date()
    const weeks: { key: string; label: string; count: number; isCurrent: boolean }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i * 7)
      const key = getWeekKey(d.toISOString().slice(0, 10))
      weeks.push({ key, label: weekLabel(key), count: 0, isCurrent: i === 0 })
    }
    for (const e of entries ?? []) {
      if (!e.date || e.sessionType === "promotion") continue
      const key = getWeekKey(e.date)
      const w = weeks.find((x) => x.key === key)
      if (w) w.count++
    }
    return weeks
  }, [entries])

  const maxWeekCount = Math.max(...weeklyBars.map((w) => w.count), 1)

  const avgPerWeek = useMemo(() => {
    const total = weeklyBars.reduce((s, w) => s + w.count, 0)
    return (total / weeklyBars.length).toFixed(1)
  }, [weeklyBars])

  const thisMonthCount = useMemo(() => {
    const now = new Date()
    const mm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    return (entries ?? []).filter((e) => e.date?.startsWith(mm) && e.sessionType !== "promotion").length
  }, [entries])

  const topFocusPercent = useMemo(() => {
    if (!stats?.recentFocus?.length) return null
    const top = stats.recentFocus[0]
    const freq = tagFrequencies[top] ?? 0
    const total = Object.values(tagFrequencies).reduce((s, n) => s + n, 0)
    if (!total) return null
    return { tag: top, pct: Math.round((freq / total) * 100) }
  }, [stats, tagFrequencies])

  const recentSessions = useMemo(() => {
    return (entries ?? [])
      .filter((e) => e.date && e.sessionType !== "promotion")
      .slice()
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, 20)
  }, [entries])

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total sessions" value={stats?.totalSessions ?? "—"} />
        <StatCard label="This month" value={thisMonthCount} />
        <StatCard label="Avg / week (12w)" value={avgPerWeek} />
        <StatCard
          label={topFocusPercent ? `Focus: ${topFocusPercent.tag}` : "Focus tag"}
          value={topFocusPercent ? `${topFocusPercent.pct}%` : "—"}
        />
      </div>

      {/* Weekly frequency bars */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-semibold text-foreground">최근 12주</h3>
          <span className="text-[10px] text-muted-foreground/70">세션/주</span>
        </div>
        <div className="flex items-end gap-1 h-28">
          {weeklyBars.map((w) => {
            const height = (w.count / maxWeekCount) * 100
            return (
              <div key={w.key} className="flex-1 flex flex-col items-center justify-end h-full">
                <span className="text-[9px] text-muted-foreground/80 mb-0.5">{w.count > 0 ? w.count : ""}</span>
                <div
                  className={`w-full rounded-sm ${w.isCurrent ? "bg-[#1D9E75]" : "bg-[#1D9E75]/40"}`}
                  style={{ height: `${Math.max(height, 2)}%` }}
                />
              </div>
            )
          })}
        </div>
        <div className="flex gap-1 mt-1">
          {weeklyBars.map((w, i) => (
            <div key={w.key} className="flex-1 text-center">
              {i % 2 === 0 && (
                <span className="text-[8px] text-muted-foreground/70">{w.label}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Recent sessions list */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-semibold text-foreground">Recent sessions</h3>
          <span className="text-[10px] text-muted-foreground/70">최근 20</span>
        </div>
        {recentSessions.length === 0 ? (
          <p className="text-[12px] text-muted-foreground/70 py-4 text-center">기록 없음</p>
        ) : (
          <div className="space-y-1.5">
            {recentSessions.map((s) => {
              const focusTags = [...s.classTags, ...s.sparringTags].slice(0, 4)
              return (
                <div
                  key={s.id}
                  className="flex items-start gap-2 py-1.5 border-b border-border/50 last:border-b-0"
                >
                  <span className="text-[11px] font-mono text-muted-foreground w-16 shrink-0">
                    {s.date ?? "?"}
                  </span>
                  {s.sessionType && (
                    <Badge
                      className={`${TYPE_COLORS[s.sessionType] ?? ""} border-0 text-[10px] px-1.5 py-0 shrink-0`}
                    >
                      {s.sessionType}
                    </Badge>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-1">
                      {focusTags.map((t) => (
                        <span
                          key={t}
                          className="px-1 py-0.5 bg-muted/50 text-muted-foreground rounded text-[10px]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  {s.instructor && (
                    <span className="text-[10px] text-muted-foreground/70 shrink-0">
                      {s.instructor}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-3">
      <div className="text-[20px] font-semibold text-foreground">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  )
}
