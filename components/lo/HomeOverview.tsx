"use client"

import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import type { BjjStats, SenseiEntry } from "@/lib/types/sensei"

// 대시보드 Home — 7 카드 + Medical rail.

interface PlayerProfileSections {
  workingHypothesis: string | null
  currentFocus: string | null
  medicalExclusions: string | null
  blockRoadmap: string | null
}

interface CompetitionRow {
  id: string
  name: string
  date: string | null
  location: string
  tier: string | null
  gi_nogi: string | null
  status: string | null
  is_target: boolean
}

interface ConceptNoteRow {
  id: string
  title: string
  date: string | null
  type: string[]
  related_count: Record<string, number>
}

const TYPE_COLORS: Record<string, string> = {
  메타: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  운영: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  전략: "bg-green-500/15 text-green-700 dark:text-green-300",
  철학: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  피지컬: "bg-red-500/15 text-red-700 dark:text-red-300",
  멘탈: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
}

function dDay(dateStr: string): string {
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (diff > 0) return `D-${diff}`
  if (diff === 0) return "D-Day"
  return `D+${Math.abs(diff)}`
}

export function HomeOverview({ goTo }: { goTo?: (tab: string) => void }) {
  const { data: profile } = useQuery<PlayerProfileSections>({
    queryKey: ["player-profile-sections"],
    queryFn: async () => {
      const r = await fetch("/api/notion/player-profile")
      if (!r.ok) throw new Error("profile err")
      return r.json()
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const { data: statsData } = useQuery<{ stats: BjjStats }>({
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

  const { data: comps } = useQuery<CompetitionRow[]>({
    queryKey: ["competitions-list"],
    queryFn: async () => {
      const r = await fetch("/api/notion/competitions")
      if (!r.ok) throw new Error("comps err")
      return r.json()
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const { data: notes } = useQuery<ConceptNoteRow[]>({
    queryKey: ["concept-notes"],
    queryFn: async () => {
      const r = await fetch("/api/notion/concept-notes")
      if (!r.ok) throw new Error("notes err")
      return r.json()
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const stats = statsData?.stats
  const recentSessions = (entries ?? [])
    .filter((e) => e.date)
    .slice()
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 3)

  const nextTarget = (comps ?? [])
    .filter((c) => c.date && new Date(c.date) >= new Date(new Date().toDateString()))
    .sort((a, b) => {
      if (a.is_target && !b.is_target) return -1
      if (!a.is_target && b.is_target) return 1
      return (a.date ?? "").localeCompare(b.date ?? "")
    })[0]

  const recentNotes = (notes ?? []).slice(0, 3)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Card 1: Character preview */}
        <Card title="Character" onClick={() => goTo?.("character")}>
          {stats ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Belt</span>
                <span className="text-[13px] font-semibold text-foreground capitalize">
                  {stats.belt} {stats.beltStripes > 0 ? `·${stats.beltStripes}` : ""}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">OVR</span>
                <span className="text-[13px] font-semibold text-foreground">{stats.combined.ovr}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Playstyle</span>
                <span className="text-[11px] text-foreground/80 truncate">{stats.playstyle}</span>
              </div>
            </div>
          ) : (
            <Skeleton />
          )}
        </Card>

        {/* Card 2: Current Focus */}
        <Card title="Current Focus" onClick={() => goTo?.("navmap")}>
          {profile?.currentFocus ? (
            <p className="text-[12px] text-foreground/80 leading-relaxed line-clamp-4 whitespace-pre-wrap">
              {profile.currentFocus}
            </p>
          ) : (
            <Placeholder label="Player Profile의 Current Focus 섹션 필요" />
          )}
        </Card>

        {/* Card 3: NavMap preview */}
        <Card title="NavMap" onClick={() => goTo?.("navmap")}>
          {stats ? (
            <div className="space-y-1.5">
              <div className="text-[11px] text-muted-foreground">최근 포커스</div>
              <div className="flex flex-wrap gap-1">
                {stats.recentFocus.length > 0 ? (
                  stats.recentFocus.slice(0, 5).map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 bg-teal-500/15 text-teal-700 dark:text-teal-300 rounded text-[10px]"
                    >
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] text-muted-foreground/70">없음</span>
                )}
              </div>
            </div>
          ) : (
            <Skeleton />
          )}
        </Card>

        {/* Card 4: Next Target */}
        <Card title="Next Target" onClick={() => goTo?.("competitions")}>
          {nextTarget ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-foreground truncate">
                  {nextTarget.name}
                </span>
                {nextTarget.date && (
                  <span className="text-[11px] font-mono text-[#993C1D] shrink-0">
                    {dDay(nextTarget.date)}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {nextTarget.tier && <span>{nextTarget.tier}</span>}
                {nextTarget.location && <span> · {nextTarget.location}</span>}
              </div>
              {nextTarget.status && (
                <Badge className="bg-muted/50 text-foreground/80 border-0 text-[10px] px-1.5 py-0">
                  {nextTarget.status}
                </Badge>
              )}
            </div>
          ) : (
            <Placeholder label="아직 등록된 대회 없음" />
          )}
        </Card>

        {/* Card 5: Recent Training */}
        <Card title="Recent Training" onClick={() => goTo?.("training")}>
          {recentSessions.length > 0 ? (
            <div className="space-y-1">
              {recentSessions.map((s) => (
                <div
                  key={s.id}
                  className="text-[11px] text-foreground/80 truncate flex items-center gap-1.5"
                >
                  <span className="text-muted-foreground font-mono shrink-0">
                    {s.date?.slice(5) ?? "?"}
                  </span>
                  <span className="text-muted-foreground/70 shrink-0">·</span>
                  <span className="truncate">
                    {s.sessionType} @ {s.gym || "?"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Skeleton />
          )}
        </Card>

        {/* Card 6: Recent Concepts */}
        <Card title="Recent Concepts" onClick={() => goTo?.("concepts")}>
          {recentNotes.length > 0 ? (
            <div className="space-y-1.5">
              {recentNotes.map((n) => (
                <div key={n.id} className="flex items-center gap-1.5 flex-wrap">
                  {n.type.slice(0, 1).map((t) => (
                    <Badge
                      key={t}
                      className={`${TYPE_COLORS[t] ?? ""} border-0 text-[10px] px-1 py-0 shrink-0`}
                    >
                      {t}
                    </Badge>
                  ))}
                  <span className="text-[11px] text-foreground/80 truncate">{n.title}</span>
                </div>
              ))}
            </div>
          ) : (
            <Placeholder label="Concept Note 아직 없음" />
          )}
        </Card>
      </div>

      {/* Medical exclusions rail */}
      <div className="rounded-xl border border-[#993C1D]/25 bg-[#FAECE7]/5 px-4 py-3">
        <div className="flex items-start gap-2">
          <span className="text-[11px] font-semibold tracking-wider text-[#993C1D] uppercase shrink-0 mt-0.5">
            Medical
          </span>
          <p className="text-[12px] text-foreground/80 leading-relaxed whitespace-pre-wrap">
            {profile?.medicalExclusions ??
              "Player Profile에 Medical exclusions 섹션을 추가하면 여기 표시돼."}
          </p>
        </div>
      </div>
    </div>
  )
}

function Card({
  title,
  onClick,
  children,
}: {
  title: string
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-border bg-card/50 p-4 text-left hover:bg-muted/40 transition-colors min-h-[120px]"
    >
      <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase mb-2">
        {title}
      </h3>
      {children}
    </button>
  )
}

function Skeleton() {
  return (
    <div className="space-y-2">
      <div className="h-3 rounded bg-muted/50 w-3/4 animate-pulse" />
      <div className="h-3 rounded bg-muted/50 w-1/2 animate-pulse" />
    </div>
  )
}

function Placeholder({ label }: { label: string }) {
  return <p className="text-[11px] text-muted-foreground/70">{label}</p>
}
