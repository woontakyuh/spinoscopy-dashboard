"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { TrainingHeatmap } from "@/components/lo/TrainingHeatmap"
import type { BjjStats, SenseiEntry } from "@/lib/types/sensei"
import type { TrainingTarget } from "@/lib/sensei/trainingEntry"

// Home = Lo 종합 dashboard.
// 오늘 briefing + this week + current focus + next target +
// recent training/concepts + mini-nav + medical rail.

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
}

interface SurgeryItem {
  name: string
  op_name: string
  hospital: string
}

const TYPE_COLORS: Record<string, string> = {
  메타: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  운영: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  전략: "bg-green-500/15 text-green-700 dark:text-green-300",
  철학: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  피지컬: "bg-red-500/15 text-red-700 dark:text-red-300",
  멘탈: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
}

const SESSION_TYPE_COLORS: Record<string, string> = {
  class: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  openmat: "bg-green-500/15 text-green-700 dark:text-green-300",
  승급식: "bg-red-500/15 text-red-700 dark:text-red-300",
  study: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  reflection: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  body: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
}

const NAV_LINKS: { id: string; label: string; icon: string; desc: string }[] = [
  { id: "character", label: "Character", icon: "🥋", desc: "radar · OVR · archetype" },
  { id: "navmap", label: "Skills", icon: "🗺️", desc: "61 positions · 94 transitions" },
  { id: "training", label: "Training", icon: "📓", desc: "달력 · 세션 기록" },
  { id: "competitions", label: "Competitions", icon: "🏆", desc: "timeline · targets" },
  { id: "concepts", label: "Concepts", icon: "💡", desc: "notes · type filter" },
]

function dDay(dateStr: string): string {
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (diff > 0) return `D-${diff}`
  if (diff === 0) return "D-Day"
  return `D+${Math.abs(diff)}`
}

function formatTodayLabel(): string {
  const d = new Date()
  return d.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  })
}

function isoWeekKey(date: string): string {
  const d = new Date(date)
  const yearStart = new Date(d.getFullYear(), 0, 1)
  const weekNum = Math.floor((d.getTime() - yearStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
  return `${d.getFullYear()}-W${weekNum}`
}

export function HomeOverview({ goTo }: { goTo?: (tab: string, target?: TrainingTarget) => void }) {
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

  const { data: statsData } = useQuery<{ stats: BjjStats; tagFrequencies: Record<string, number> }>({
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

  const { data: todaySurgeries } = useQuery<SurgeryItem[]>({
    queryKey: ["dashboard-surgery"],
    queryFn: async () => {
      const r = await fetch("/api/dashboard/surgery")
      if (!r.ok) throw new Error("surgery err")
      return r.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const stats = statsData?.stats
  const tagFreqs = statsData?.tagFrequencies ?? {}

  // 이번 주 세션 수 (gym only — class/openmat)
  const thisWeekCount = useMemo(() => {
    if (!entries) return 0
    const now = new Date()
    const currentWeek = isoWeekKey(now.toISOString().slice(0, 10))
    return entries.filter(
      (e) =>
        e.date &&
        (e.sessionType === "class" || e.sessionType === "openmat") &&
        isoWeekKey(e.date) === currentWeek,
    ).length
  }, [entries])

  // 최근 3 세션
  const recentSessions = useMemo(() => {
    return (entries ?? [])
      .filter((e) => e.date)
      .slice()
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, 4)
  }, [entries])

  // 다음 target 대회
  const nextTarget = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10)
    const upcoming = (comps ?? []).filter((c) => c.date && c.date >= todayIso)
    upcoming.sort((a, b) => {
      if (a.is_target && !b.is_target) return -1
      if (!a.is_target && b.is_target) return 1
      return (a.date ?? "").localeCompare(b.date ?? "")
    })
    return upcoming[0] ?? null
  }, [comps])

  // 최근 3 concept notes
  const recentNotes = (notes ?? []).slice(0, 3)

  // 상위 focus tag
  const topFocusTag = useMemo(() => {
    if (!stats?.recentFocus?.length) return null
    const top = stats.recentFocus[0]
    const freq = tagFreqs[top] ?? 0
    const total = Object.values(tagFreqs).reduce((s, n) => s + n, 0)
    if (!total) return { tag: top, pct: null as number | null }
    return { tag: top, pct: Math.round((freq / total) * 100) }
  }, [stats, tagFreqs])

  // 오늘 훈련 여부 (이번 주 gym 세션 기반 권유 톤)
  const todayCoach = useMemo(() => {
    if (!stats) return ""
    if (stats.streaks.current >= 3) return `${stats.streaks.current}주 연속. 페이스 좋아 — 오늘도 매트.`
    if (stats.streaks.current === 0) return "이번 주 아직 매트 안 올라갔지. 가볍게라도 붙어보자."
    if (thisWeekCount >= 3) return "이번 주 잘 찍고 있어. 몸 좀 풀고 가볍게 하고 와."
    return "꾸준함이 답이야. 오늘 한 라운드."
  }, [stats, thisWeekCount])

  return (
    <div className="space-y-4">
      {/* ─── Today Briefing strip ─── */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase mb-1">
              Today
            </div>
            <div className="text-[15px] font-semibold text-foreground">{formatTodayLabel()}</div>
            <p className="text-[12px] text-foreground/80 mt-1">{todayCoach}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Pill label="수술" value={todaySurgeries?.length ?? 0} />
            <Pill label="이번 주 매트" value={thisWeekCount} suffix="회" />
            <Pill label="streak" value={stats?.streaks.current ?? 0} suffix="주" />
            {nextTarget && nextTarget.date && (
              <Pill label="다음 대회" value={dDay(nextTarget.date)} highlight />
            )}
          </div>
        </div>
      </div>

      <TrainingHeatmap entries={entries ?? []} onOpenTraining={(target) => goTo?.("training", target)} />

      {/* ─── 3 카드 row: Week / Focus / Target ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* This Week */}
        <Card title="This Week" onClick={() => goTo?.("training")}>
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[22px] font-semibold text-foreground">{thisWeekCount}</span>
              <span className="text-[11px] text-muted-foreground">세션</span>
            </div>
            {topFocusTag && (
              <div className="text-[11px] text-muted-foreground">
                탑 태그:{" "}
                <span className="text-foreground/80">{topFocusTag.tag}</span>
                {topFocusTag.pct !== null && (
                  <span className="text-muted-foreground/70"> · {topFocusTag.pct}%</span>
                )}
              </div>
            )}
            <div className="text-[11px] text-muted-foreground">
              streak {stats?.streaks.current ?? 0}주 · 올해 {stats?.sessions2026 ?? 0}회
            </div>
          </div>
        </Card>

        {/* Hypothesis & Focus — Player Profile 두 섹션 통합 카드 */}
        <Card title="Hypothesis & Focus" onClick={() => goTo?.("navmap")}>
          {profile?.workingHypothesis || profile?.currentFocus ? (
            <div className="space-y-2">
              {profile?.workingHypothesis && (
                <div className="border-l-2 border-[#1D9E75]/60 pl-2 -ml-1">
                  <p className="text-[10px] font-semibold tracking-wider text-[#1D9E75] uppercase mb-0.5">
                    Hypothesis
                  </p>
                  <p className="text-[11px] text-foreground/80 leading-relaxed line-clamp-2 whitespace-pre-wrap">
                    {profile.workingHypothesis}
                  </p>
                </div>
              )}
              {profile?.currentFocus && (
                <div>
                  <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase mb-0.5">
                    Current Focus
                  </p>
                  <p className="text-[11px] text-foreground/80 leading-relaxed line-clamp-3 whitespace-pre-wrap">
                    {profile.currentFocus}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/70">
              Player Profile에 `## Working hypothesis` / `## Current Focus` 섹션 추가 시 표시
            </p>
          )}
        </Card>

        {/* Next Target */}
        <Card title="Next Target" onClick={() => goTo?.("competitions")}>
          {nextTarget ? (
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[13px] font-semibold text-foreground leading-tight line-clamp-2">
                  {nextTarget.name}
                </span>
                {nextTarget.date && (
                  <span className="text-[11px] font-mono text-[#993C1D] shrink-0">
                    {dDay(nextTarget.date)}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground line-clamp-1">
                {[nextTarget.tier, nextTarget.location, nextTarget.gi_nogi].filter(Boolean).join(" · ")}
              </div>
              {nextTarget.status && (
                <Badge className="bg-muted/50 text-foreground/80 border-0 text-[10px] px-1.5 py-0">
                  {nextTarget.status}
                </Badge>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/70">등록된 대회 없음</p>
          )}
        </Card>
      </div>

      {/* ─── Recent training + concepts ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card title="Recent Training" onClick={() => goTo?.("training")}>
          {recentSessions.length > 0 ? (
            <div className="space-y-1.5">
              {recentSessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 text-[12px] text-foreground/80 min-w-0"
                >
                  <span className="text-muted-foreground font-mono shrink-0 w-14">
                    {s.date?.slice(5) ?? "?"}
                  </span>
                  {s.sessionType && (
                    <Badge
                      className={`${SESSION_TYPE_COLORS[s.sessionType] ?? ""} border-0 text-[10px] px-1 py-0 shrink-0`}
                    >
                      {s.sessionType}
                    </Badge>
                  )}
                  <span className="truncate text-muted-foreground">
                    {[...s.classTags, ...s.sparringTags].slice(0, 3).join(", ") || s.gym || "—"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/70">세션 기록 없음</p>
          )}
        </Card>

        <Card title="Recent Concepts" onClick={() => goTo?.("concepts")}>
          {recentNotes.length > 0 ? (
            <div className="space-y-1.5">
              {recentNotes.map((n) => (
                <div key={n.id} className="flex items-center gap-1.5 flex-wrap min-w-0">
                  {n.type.slice(0, 1).map((t) => (
                    <Badge
                      key={t}
                      className={`${TYPE_COLORS[t] ?? ""} border-0 text-[10px] px-1 py-0 shrink-0`}
                    >
                      {t}
                    </Badge>
                  ))}
                  <span className="text-[12px] text-foreground/80 truncate">{n.title}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/70">
              Concept Note 없음 (Notion 연결 후 claude.ai Lo에서 작성)
            </p>
          )}
        </Card>
      </div>

      {/* ─── Mini-nav grid ─── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {NAV_LINKS.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => goTo?.(n.id)}
            className="rounded-xl border border-border bg-muted/30 p-3 text-left hover:bg-muted/60 transition-colors"
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <span>{n.icon}</span>
              <span className="text-[12px] font-semibold text-foreground">{n.label}</span>
            </div>
            <p className="text-[10px] text-muted-foreground truncate">{n.desc}</p>
          </button>
        ))}
      </div>

      {/* ─── Medical rail ─── */}
      <div className="rounded-xl border border-[#993C1D]/25 bg-[#FAECE7]/5 px-4 py-3">
        <div className="flex items-start gap-2">
          <span className="text-[11px] font-semibold tracking-wider text-[#993C1D] uppercase shrink-0 mt-0.5">
            Medical
          </span>
          <p className="text-[12px] text-foreground/80 leading-relaxed whitespace-pre-wrap line-clamp-3">
            {profile?.medicalExclusions ??
              "Player Profile에 `## Medical exclusions` 섹션을 추가하면 여기 표시됨."}
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
      className="rounded-xl border border-border bg-card/50 p-4 text-left hover:bg-muted/40 transition-colors min-h-[110px]"
    >
      <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase mb-2">
        {title}
      </h3>
      {children}
    </button>
  )
}

function Pill({
  label,
  value,
  suffix,
  highlight = false,
}: {
  label: string
  value: string | number
  suffix?: string
  highlight?: boolean
}) {
  return (
    <div
      className={`flex items-baseline gap-1.5 rounded-lg px-2.5 py-1 ${
        highlight
          ? "bg-[#993C1D]/15 border border-[#993C1D]/30"
          : "bg-muted/40 border border-border"
      }`}
    >
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span
        className={`text-[13px] font-semibold ${highlight ? "text-[#993C1D]" : "text-foreground"}`}
      >
        {value}
        {suffix && <span className="text-muted-foreground/70 ml-0.5 text-[10px]">{suffix}</span>}
      </span>
    </div>
  )
}
