"use client"

import { useState, useMemo, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import type { EditorialItem, EditorialRole, EditorialStatus } from "@/lib/types/editorial"

// ── Helpers ──────────────────────────────────────────────────

function countBy<T>(items: T[], keyFn: (item: T) => string | null): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const item of items) {
    const key = keyFn(item)
    if (key) counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

function sortedEntries(record: Record<string, number>, limit = 20): [string, number][] {
  return Object.entries(record).sort((a, b) => b[1] - a[1]).slice(0, limit)
}

function daysBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

function dDayLabel(dateStr: string | null): { text: string; color: string } | null {
  if (!dateStr) return null
  const target = new Date(dateStr.slice(0, 10) + "T00:00:00+09:00")
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }) + "T00:00:00+09:00")
  const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, color: "text-red-400 font-bold" }
  if (diff === 0) return { text: "D-Day", color: "text-cyan-400 font-bold" }
  if (diff <= 5) return { text: `D-${diff}`, color: "text-amber-400" }
  return { text: `D-${diff}`, color: "text-muted-foreground" }
}

// ── Color configs ────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  "Received": "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  "Editorial Review": "bg-blue-500/15 text-blue-300 border-blue-500/30",
  "Desk Reject": "bg-red-500/15 text-red-300 border-red-500/30",
  "Reviewer Assignment": "bg-purple-500/15 text-purple-300 border-purple-500/30",
  "Under Peer Review": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "Reviews Collected": "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  "Decision Made": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "Revision Received": "bg-orange-500/15 text-orange-300 border-orange-500/30",
  "Complete": "bg-green-500/15 text-green-300 border-green-500/30",
}

const DECISION_COLORS: Record<string, string> = {
  "Accept": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "Minor Revision": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "Major Revision": "bg-orange-500/15 text-orange-300 border-orange-500/30",
  "Reject": "bg-red-500/15 text-red-300 border-red-500/30",
  "Peer Review": "bg-blue-500/15 text-blue-300 border-blue-500/30",
  "Desk Reject": "bg-red-500/15 text-red-300 border-red-500/30",
  "Pending": "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
}

const ROLE_COLORS: Record<string, string> = {
  "Editor": "bg-blue-500/15 text-blue-300 border-blue-500/30",
  "Reviewer": "bg-green-500/15 text-green-300 border-green-500/30",
}

type ChartDim = "status" | "journal" | "decision" | "manuscript_type"

const CHART_CONFIG: Record<ChartDim, { title: string; color: string }> = {
  status: { title: "Status", color: "indigo" },
  journal: { title: "Journal", color: "cyan" },
  decision: { title: "Decision", color: "emerald" },
  manuscript_type: { title: "Manuscript Type", color: "amber" },
}

const BAR_COLORS: Record<string, { bar: string; barActive: string; barDim: string; ring: string; dot: string }> = {
  indigo: { bar: "bg-indigo-500", barActive: "bg-indigo-400", barDim: "bg-indigo-500/40", ring: "ring-indigo-400/50", dot: "bg-indigo-400" },
  cyan: { bar: "bg-cyan-500", barActive: "bg-cyan-400", barDim: "bg-cyan-500/40", ring: "ring-cyan-400/50", dot: "bg-cyan-400" },
  emerald: { bar: "bg-emerald-500", barActive: "bg-emerald-400", barDim: "bg-emerald-500/40", ring: "ring-emerald-400/50", dot: "bg-emerald-400" },
  amber: { bar: "bg-amber-500", barActive: "bg-amber-400", barDim: "bg-amber-500/40", ring: "ring-amber-400/50", dot: "bg-amber-400" },
}

// Workflow stages in order
const WORKFLOW_STAGES: EditorialStatus[] = [
  "Received", "Editorial Review", "Reviewer Assignment",
  "Under Peer Review", "Reviews Collected", "Decision Made",
  "Revision Received", "Complete",
]

const TERMINAL_STATUSES = new Set<string>(["Complete", "Desk Reject"])
const ACTIVE_FILTER = (item: EditorialItem) => !TERMINAL_STATUSES.has(item.status)

// ── Main Component ───────────────────────────────────────────

export function Editorial() {
  const [roleFilter, setRoleFilter] = useState<EditorialRole | "all">("all")
  const [chartFilters, setChartFilters] = useState<Partial<Record<ChartDim, Set<string>>>>({})
  const [view, setView] = useState<"active" | "history">("active")

  const { data: items, isLoading } = useQuery<EditorialItem[]>({
    queryKey: ["editorial"],
    queryFn: async () => {
      const res = await fetch("/api/notion/editorial")
      if (!res.ok) throw new Error("Editorial 데이터 로딩 실패")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // Role filtered base
  const roleFiltered = useMemo(() => {
    if (!items) return []
    if (roleFilter === "all") return items
    return items.filter(i => i.role === roleFilter)
  }, [items, roleFilter])

  // Chart toggle
  const toggleChart = useCallback((dim: ChartDim, value: string) => {
    setChartFilters(prev => {
      const current = prev[dim] ?? new Set<string>()
      const next = new Set(current)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      const updated = { ...prev }
      if (next.size === 0) delete updated[dim]
      else updated[dim] = next
      return updated
    })
  }, [])

  // Value getter per dimension
  const getDimValue = useCallback((item: EditorialItem, dim: ChartDim): string | null => {
    switch (dim) {
      case "status": return item.status
      case "journal": return item.journal || null
      case "decision": return item.first_recommendation || item.final_decision || null
      case "manuscript_type": return item.manuscript_type || null
    }
  }, [])

  // Cross-filter bases (each chart excludes its own dimension)
  const chartBase = useCallback((excludeDim: ChartDim) => {
    return roleFiltered.filter(item => {
      for (const [dim, vals] of Object.entries(chartFilters) as [ChartDim, Set<string>][]) {
        if (dim === excludeDim) continue
        const v = getDimValue(item, dim)
        if (vals.size > 0 && (!v || !vals.has(v))) return false
      }
      return true
    })
  }, [roleFiltered, chartFilters, getDimValue])

  // Fully filtered (all dimensions applied)
  const filtered = useMemo(() => {
    return roleFiltered.filter(item => {
      for (const [dim, vals] of Object.entries(chartFilters) as [ChartDim, Set<string>][]) {
        const v = getDimValue(item, dim)
        if (vals.size > 0 && (!v || !vals.has(v))) return false
      }
      return true
    })
  }, [roleFiltered, chartFilters, getDimValue])

  const activeItems = useMemo(() => filtered.filter(ACTIVE_FILTER).sort((a, b) => {
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline)
    if (a.deadline) return -1
    if (b.deadline) return 1
    return (b.date_received ?? "").localeCompare(a.date_received ?? "")
  }), [filtered])

  const completedItems = useMemo(() => filtered.filter(i => TERMINAL_STATUSES.has(i.status)).sort((a, b) =>
    (b.decision_date ?? b.date_received ?? "").localeCompare(a.decision_date ?? a.date_received ?? "")
  ), [filtered])

  // Chart aggregations (cross-filtered)
  const statusCounts = useMemo(() => countBy(chartBase("status"), i => i.status), [chartBase])
  const journalCounts = useMemo(() => countBy(chartBase("journal"), i => i.journal || null), [chartBase])
  const decisionCounts = useMemo(() => countBy(chartBase("decision"), i => i.first_recommendation || i.final_decision || null), [chartBase])
  const typeCounts = useMemo(() => countBy(chartBase("manuscript_type"), i => i.manuscript_type || null), [chartBase])

  // Metrics
  const metrics = useMemo(() => {
    const active = filtered.filter(ACTIVE_FILTER).length
    const completed = filtered.filter(i => TERMINAL_STATUSES.has(i.status)).length
    const turnarounds = filtered
      .filter(i => i.date_received && i.decision_date)
      .map(i => daysBetween(i.date_received, i.decision_date)!)
      .filter(d => d >= 0)
    const avgTurnaround = turnarounds.length > 0
      ? Math.round(turnarounds.reduce((s, d) => s + d, 0) / turnarounds.length)
      : 0
    const now = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
    const overdue = filtered.filter(i => ACTIVE_FILTER(i) && i.deadline && i.deadline < now).length
    return { active, completed, avgTurnaround, overdue }
  }, [filtered])

  const hasChartFilters = Object.keys(chartFilters).length > 0

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in-up">
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[72px] bg-muted/60 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-48 bg-muted/60 rounded-xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in-up space-y-4">
      {/* Role Filter */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1 bg-muted border border-border rounded-lg p-1">
          {(["all", "Editor", "Reviewer"] as const).map(r => (
            <button
              key={r}
              onClick={() => { setRoleFilter(r); setChartFilters({}) }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                roleFilter === r ? "bg-indigo-600 text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r === "all" ? "All" : r}
            </button>
          ))}
        </div>
        <span className="text-muted-foreground text-xs">{roleFiltered.length}건</span>
        {hasChartFilters && (
          <button
            onClick={() => setChartFilters({})}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
          >
            필터 초기화
          </button>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Active" value={metrics.active} accent="text-blue-400" />
        <MetricCard label="Completed" value={metrics.completed} accent="text-emerald-400" />
        <MetricCard label="Avg Turnaround" value={metrics.avgTurnaround > 0 ? `${metrics.avgTurnaround}d` : "—"} accent="text-indigo-400" />
        <MetricCard label="Overdue" value={metrics.overdue} accent={metrics.overdue > 0 ? "text-red-400" : "text-muted-foreground"} />
      </div>

      {/* Charts 2×2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <BarChart
          title={CHART_CONFIG.status.title}
          entries={sortedEntries(statusCounts)}
          activeKeys={chartFilters.status ?? new Set()}
          onClickItem={key => toggleChart("status", key)}
          color="indigo"

        />
        <BarChart
          title={CHART_CONFIG.journal.title}
          entries={sortedEntries(journalCounts)}
          activeKeys={chartFilters.journal ?? new Set()}
          onClickItem={key => toggleChart("journal", key)}
          color="cyan"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <BarChart
          title={CHART_CONFIG.decision.title}
          entries={sortedEntries(decisionCounts)}
          activeKeys={chartFilters.decision ?? new Set()}
          onClickItem={key => toggleChart("decision", key)}
          color="emerald"

        />
        <BarChart
          title={CHART_CONFIG.manuscript_type.title}
          entries={sortedEntries(typeCounts)}
          activeKeys={chartFilters.manuscript_type ?? new Set()}
          onClickItem={key => toggleChart("manuscript_type", key)}
          color="amber"
        />
      </div>

      {/* Workflow Pipeline */}
      <WorkflowPipeline items={filtered} />

      {/* View Toggle */}
      <div className="flex gap-1 bg-muted border border-border rounded-lg p-1 w-fit">
        <button
          onClick={() => setView("active")}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
            view === "active" ? "bg-indigo-600 text-white" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Active ({activeItems.length})
        </button>
        <button
          onClick={() => setView("history")}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
            view === "history" ? "bg-indigo-600 text-white" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          History ({completedItems.length})
        </button>
      </div>

      {/* Table */}
      {view === "active" ? (
        <ActiveTable items={activeItems} />
      ) : (
        <HistoryTable items={completedItems} />
      )}
    </div>
  )
}

// ── MetricCard ──────────────────────────────────────────────

function MetricCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="card-hover rounded-xl border border-border/80 bg-card px-4 py-3">
      <span className="text-[11px] text-muted-foreground font-medium tracking-wide">{label}</span>
      <p className={`text-2xl font-semibold num leading-none mt-1 ${accent}`}>{value}</p>
    </div>
  )
}

// ── BarChart (multi-select, same as PaperDB) ────────────────

function BarChart({
  title, entries, activeKeys, onClickItem, color,
}: {
  title: string
  entries: [string, number][]
  activeKeys: Set<string>
  onClickItem: (key: string) => void
  color: string
}) {
  const c = BAR_COLORS[color] ?? BAR_COLORS.indigo
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-border/80 bg-card p-4">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
        </div>
        <p className="text-muted-foreground/70 text-xs text-center py-6">데이터 없음</p>
      </div>
    )
  }

  const maxCount = entries[0][1]
  const hasActive = activeKeys.size > 0

  return (
    <div className="rounded-xl border border-border/80 bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
        </div>
        <span className="text-[10px] text-muted-foreground/70 num">{entries.reduce((s, [, n]) => s + n, 0)}</span>
      </div>
      <div className="space-y-[5px] mt-3">
        {entries.map(([key, count]) => {
          const isActive = activeKeys.has(key)
          const isDimmed = hasActive && !isActive
          const pct = Math.max((count / maxCount) * 100, 3)

          return (
            <button
              key={key}
              onClick={() => onClickItem(key)}
              className={`w-full flex items-center gap-2 py-[5px] px-2.5 rounded-lg text-left transition-all duration-150 cursor-pointer group
                ${isActive ? `bg-muted/70 ring-1 ${c.ring}` : "hover:bg-muted/80"}
                ${isDimmed ? "opacity-50" : "opacity-100"}
              `}
            >
              <span className={`text-xs w-[130px] shrink-0 truncate transition-colors ${
                isActive ? "text-foreground font-medium" : "text-muted-foreground group-hover:text-foreground/90"
              }`}>
                {key}
              </span>
              <div className="flex-1 h-[7px] bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${isActive ? c.barActive : isDimmed ? c.barDim : c.bar}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={`text-[11px] w-7 text-right num transition-colors ${isActive ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Workflow Pipeline ────────────────────────────────────────

function WorkflowPipeline({ items }: { items: EditorialItem[] }) {
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of WORKFLOW_STAGES) counts[s] = 0
    for (const item of items) {
      if (item.status in counts) counts[item.status]++
    }
    // Desk Reject는 별도 카운트
    counts["Desk Reject"] = items.filter(i => i.status === "Desk Reject").length
    return counts
  }, [items])

  return (
    <div className="rounded-xl border border-border/80 bg-card p-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Workflow</h3>
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {WORKFLOW_STAGES.map((stage, i) => {
          const count = stageCounts[stage] || 0
          const isActive = count > 0
          return (
            <div key={stage} className="flex items-center gap-1 shrink-0">
              <div className={`flex flex-col items-center gap-1 px-2.5 py-1.5 rounded-lg border transition-colors ${
                isActive ? "border-indigo-500/40 bg-indigo-950/30" : "border-border/30 bg-muted/40"
              }`}>
                <span className={`text-[10px] font-medium whitespace-nowrap ${isActive ? "text-indigo-300" : "text-muted-foreground/70"}`}>
                  {stage}
                </span>
                <span className={`text-sm font-bold num ${isActive ? "text-indigo-300" : "text-muted-foreground/50"}`}>
                  {count}
                </span>
              </div>
              {i < WORKFLOW_STAGES.length - 1 && (
                <svg className="size-3 text-muted-foreground/50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Active Table ────────────────────────────────────────────

function ActiveTable({ items }: { items: EditorialItem[] }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm text-center py-8">진행 중인 항목이 없습니다.</p>
  }

  return (
    <div className="rounded-xl border border-border/80 bg-card overflow-hidden">
      <div className="grid grid-cols-[90px_60px_1fr_100px_110px_70px] gap-2 px-4 py-2 bg-muted/80 border-b border-border text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
        <span>ID</span>
        <span>Role</span>
        <span>제목</span>
        <span>Journal</span>
        <span>Status</span>
        <span className="text-right">Deadline</span>
      </div>
      {items.map(item => {
        const dd = dDayLabel(item.deadline)
        return (
          <a
            key={item.page_id}
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="grid grid-cols-[90px_60px_1fr_100px_110px_70px] gap-2 px-4 py-2.5 items-center border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors"
          >
            <span className="text-xs font-medium text-foreground num truncate">{item.manuscript_id || "—"}</span>
            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-[18px] font-medium ${ROLE_COLORS[item.role] ?? ""}`}>
              {item.role}
            </Badge>
            <span className="text-xs text-foreground/90 truncate" title={item.name}>{item.name}</span>
            <span className="text-[10px] text-muted-foreground truncate">{item.journal || "—"}</span>
            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-[18px] font-medium ${STATUS_COLORS[item.status] ?? ""}`}>
              {item.status}
            </Badge>
            <span className={`text-[11px] text-right num ${dd?.color ?? "text-muted-foreground/50"}`}>
              {dd?.text ?? "—"}
            </span>
          </a>
        )
      })}
    </div>
  )
}

// ── History Table ───────────────────────────────────────────

function HistoryTable({ items }: { items: EditorialItem[] }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm text-center py-8">완료된 항목이 없습니다.</p>
  }

  return (
    <div className="rounded-xl border border-border/80 bg-card overflow-hidden">
      <div className="grid grid-cols-[90px_60px_1fr_100px_110px_80px_70px] gap-2 px-4 py-2 bg-muted/80 border-b border-border text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
        <span>ID</span>
        <span>Role</span>
        <span>제목</span>
        <span>Journal</span>
        <span>Decision</span>
        <span>Round</span>
        <span className="text-right">Days</span>
      </div>
      {items.map(item => {
        const turnaround = daysBetween(item.date_received, item.decision_date)
        const decision = item.final_decision || item.last_recommendation || item.first_recommendation || "—"
        return (
          <a
            key={item.page_id}
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="grid grid-cols-[90px_60px_1fr_100px_110px_80px_70px] gap-2 px-4 py-2.5 items-center border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors"
          >
            <span className="text-xs font-medium text-foreground num truncate">{item.manuscript_id || "—"}</span>
            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-[18px] font-medium ${ROLE_COLORS[item.role] ?? ""}`}>
              {item.role}
            </Badge>
            <span className="text-xs text-foreground/90 truncate" title={item.name}>{item.name}</span>
            <span className="text-[10px] text-muted-foreground truncate">{item.journal || "—"}</span>
            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-[18px] font-medium ${DECISION_COLORS[decision] ?? ""}`}>
              {decision}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {item.review_round ? `R${item.review_round}` : "—"}
            </span>
            <span className="text-xs text-muted-foreground text-right num">
              {turnaround !== null ? `${turnaround}d` : "—"}
            </span>
          </a>
        )
      })}
    </div>
  )
}
