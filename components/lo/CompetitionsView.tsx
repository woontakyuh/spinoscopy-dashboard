"use client"

import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { SenseiCompetition } from "@/components/sensei/SenseiCompetition"
import {
  FOLLOWED_EVENTS,
  INTERNATIONAL_FOLLOWED_EVENTS,
  KOREAN_FOLLOWED_EVENTS,
} from "@/lib/sensei/competitions"
import { competitionDday, getSeoulDateKey } from "@/lib/sensei/date"

// Phase 3 Competitions tab — 상단 yearly timeline + upcoming targets list +
// sources panel, 하단은 기존 SenseiCompetition(달력 뷰) 유지.

interface CompetitionRow {
  id: string
  url: string
  name: string
  date: string | null
  location: string
  tier: string | null
  belt: string | null
  weight_class: string | null
  division: string | null
  gi_nogi: string | null
  status: string | null
  is_target: boolean
  result: string
  source: string | null
}

function markerColor(c: CompetitionRow): string {
  if (c.is_target || c.status === "registered") return "#F97316"
  if (c.status === "interested") return "#F59E0B"
  return "#71717A"
}

export function CompetitionsView() {
  const { data: comps, isLoading, error } = useQuery<CompetitionRow[]>({
    queryKey: ["competitions-list"],
    queryFn: async () => {
      const r = await fetch("/api/notion/competitions")
      if (!r.ok) throw new Error("comps err")
      return r.json()
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const { year, timelineItems } = useMemo(() => {
    const now = new Date()
    const y = now.getFullYear()
    const rows = (comps ?? []).filter((c) => c.date?.startsWith(String(y)))
    return {
      year: y,
      timelineItems: rows.map((c) => ({
        comp: c,
        // 0~1 fraction of year
        frac: c.date ? dayOfYearFrac(c.date) : 0,
      })),
    }
  }, [comps])

  const upcomingTargets = useMemo(() => {
    const todayIso = getSeoulDateKey()
    const verifiedRows: CompetitionRow[] = FOLLOWED_EVENTS.map((event) => ({
      id: event.id,
      url: event.url ?? "",
      name: event.name,
      date: event.date,
      location: event.location,
      tier: event.organization,
      belt: null,
      weight_class: null,
      division: null,
      gi_nogi: event.ruleSet,
      status: null,
      is_target: false,
      result: "",
      source: "verified",
    }))
    const seen = new Set<string>()

    return [...(comps ?? []), ...verifiedRows]
      .filter((c) => c.date && c.date >= todayIso)
      .sort((a, b) => {
        if (a.is_target && !b.is_target) return -1
        if (!a.is_target && b.is_target) return 1
        return (a.date ?? "").localeCompare(b.date ?? "")
      })
      .filter((c) => {
        const key = `${c.date}:${c.name.toLowerCase()}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 8)
  }, [comps])

  const sourceCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of comps ?? []) {
      const k = c.source ?? "other"
      m[k] = (m[k] ?? 0) + 1
    }
    return m
  }, [comps])

  return (
    <div className="space-y-6">
      {/* Yearly timeline */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-foreground">내 대회 {year} 타임라인</h3>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <LegendDot color="#993C1D" label="Target/Registered" />
            <LegendDot color="#F59E0B" label="Considering" />
            <LegendDot color="#71717A" label="Other" />
          </div>
        </div>

        {isLoading ? (
          <p className="text-[12px] text-muted-foreground/70 py-6 text-center">Loading…</p>
        ) : error || !comps ? (
          <p className="text-[12px] text-muted-foreground/70 py-6 text-center">
            Competitions DB가 ClinicalPipeline integration에 아직 연결되지 않았거나 비어있습니다.
          </p>
        ) : timelineItems.length === 0 ? (
          <p className="text-[12px] text-muted-foreground/70 py-6 text-center">
            {year}년 등록된 대회 없음.
          </p>
        ) : (
          <div className="relative h-14 mt-3">
            {/* Axis */}
            <div className="absolute left-0 right-0 top-1/2 h-px bg-border -translate-y-1/2" />
            {/* Month gridlines */}
            {Array.from({ length: 12 }).map((_, m) => (
              <div
                key={m}
                className="absolute top-1/2 w-px h-2 bg-border/60 -translate-y-1/2"
                style={{ left: `${(m / 12) * 100}%` }}
              />
            ))}
            {Array.from({ length: 12 }).map((_, m) => (
              <div
                key={`l-${m}`}
                className="absolute top-0 text-[9px] text-muted-foreground/70"
                style={{ left: `${(m / 12) * 100}%`, transform: "translateX(-50%)" }}
              >
                {m + 1}
              </div>
            ))}
            {/* Event dots */}
            {timelineItems.map(({ comp, frac }) => (
              <div
                key={comp.id}
                className="absolute top-1/2 -translate-y-1/2 group"
                style={{ left: `${frac * 100}%`, transform: "translate(-50%, -50%)" }}
              >
                <div
                  className="rounded-full cursor-pointer"
                  style={{
                    width: comp.is_target ? 14 : 10,
                    height: comp.is_target ? 14 : 10,
                    backgroundColor: markerColor(comp),
                    border: comp.is_target ? "2px solid white" : "none",
                  }}
                  title={`${comp.name} · ${comp.date}`}
                />
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 whitespace-nowrap text-[10px] bg-muted border border-border rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                  {comp.name} · {comp.date}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming targets */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-foreground">다가오는 대회</h3>
          <span className="text-[10px] text-muted-foreground">
            내 관심 일정 + 검증된 국내외 일정
          </span>
        </div>
        {upcomingTargets.length === 0 ? (
          <p className="text-[12px] text-muted-foreground/70 py-4 text-center">예정된 대회 없음.</p>
        ) : (
          <div className="space-y-2">
            {upcomingTargets.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 py-2 last:border-b-0 sm:flex-nowrap"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {c.url ? (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-[13px] font-medium text-foreground hover:text-orange-400"
                      >
                        {c.name} ↗
                      </a>
                    ) : (
                      <span className="truncate text-[13px] font-medium text-foreground">{c.name}</span>
                    )}
                    {c.tier && (
                      <Badge className="bg-muted/50 text-foreground/80 border-0 text-[10px] px-1.5 py-0">
                        {c.tier}
                      </Badge>
                    )}
                    {c.status && (
                      <Badge
                        className={`border-0 text-[10px] px-1.5 py-0 ${
                          c.status === "registered"
                            ? "bg-green-500/15 text-green-700 dark:text-green-300"
                            : c.status === "interested"
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                              : "bg-muted/50 text-muted-foreground"
                        }`}
                      >
                        {c.status}
                      </Badge>
                    )}
                    {c.source === "verified" && (
                      <Badge className="border-0 bg-zinc-500/15 px-1.5 py-0 text-[10px] text-zinc-300">
                        검증 출처
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {c.date} · {c.location}
                    {c.division ? ` · ${c.division}` : ""}
                    {c.gi_nogi ? ` · ${c.gi_nogi}` : ""}
                  </div>
                </div>
                <span className="shrink-0 font-mono text-[12px] text-orange-400">
                  {c.date ? competitionDday(c.date) : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sources aggregation */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <h3 className="text-[13px] font-semibold text-foreground mb-3">조사 출처</h3>
        <div className="flex flex-wrap gap-2">
          <Badge className="border-0 bg-orange-500/15 px-2 py-0.5 text-[11px] text-orange-300">
            국내 공식·등록 · {KOREAN_FOLLOWED_EVENTS.length}
          </Badge>
          <Badge className="border-0 bg-blue-500/15 px-2 py-0.5 text-[11px] text-blue-300">
            국제 공식 · {INTERNATIONAL_FOLLOWED_EVENTS.length}
          </Badge>
          {Object.entries(sourceCounts).map(([src, n]) => (
            <Badge
              key={src}
              className="bg-muted/50 text-foreground/80 border-0 text-[11px] px-2 py-0.5"
            >
              내 DB {src} · {n}
            </Badge>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground/80">
          2026-08-17 조사 · FLOWCOMP, Spotlite, IBJJF, AJP, ADCC 등 공식·등록 페이지 기준.
          캘린더 상세에서 원문 링크를 바로 확인할 수 있습니다.
        </p>
      </div>

      {/* Fallback: calendar view */}
      <div>
        <h3 className="text-[13px] font-semibold text-foreground mb-3">전체 일정 캘린더</h3>
        <SenseiCompetition />
      </div>
    </div>
  )
}

function dayOfYearFrac(isoDate: string): number {
  const d = new Date(isoDate)
  const start = new Date(d.getFullYear(), 0, 1)
  const day = (d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  return Math.min(Math.max(day / 365, 0), 1)
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}
