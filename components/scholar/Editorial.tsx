"use client"

import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import type {
  EditorialItem,
  EditorialRole,
} from "@/lib/types/editorial"
import { ChevronDown } from "lucide-react"
import { REVISION_STATUSES } from "@/lib/editorial/status"
import type { EditorialStatus } from "@/lib/types/editorial"

// ── Helpers ──────────────────────────────────────────────

function getTodaySeoul(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24))
}

function deadlineInfo(deadline: string | null): { text: string; color: string; urgency: "overdue" | "soon" | "normal" | "none" } {
  if (!deadline) return { text: "마감 미정", color: "text-muted-foreground/50", urgency: "none" }
  const diff = daysBetween(getTodaySeoul(), deadline)
  if (diff < 0) return { text: `${Math.abs(diff)}일 초과`, color: "text-red-400 font-bold", urgency: "overdue" }
  if (diff === 0) return { text: "D-Day", color: "text-red-400 font-bold", urgency: "overdue" }
  if (diff <= 7) return { text: `D-${diff}`, color: "text-amber-400 font-semibold", urgency: "soon" }
  return { text: `D-${diff}`, color: "text-muted-foreground", urgency: "normal" }
}

function formatDate(d: string | null): string {
  if (!d) return "—"
  return d.slice(5) // "MM-DD"
}

function thisMonthStart(): string {
  const now = new Date()
  const seoul = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }))
  seoul.setDate(1)
  return seoul.toLocaleDateString("en-CA")
}

// ── Colors ──────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  "Received": "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  "1st Review": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "2nd Review": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "3rd Review": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "1st Revision": "bg-orange-500/15 text-orange-300 border-orange-500/30",
  "2nd Revision": "bg-orange-500/15 text-orange-300 border-orange-500/30",
  "3rd Revision": "bg-orange-500/15 text-orange-300 border-orange-500/30",
  "Under Review": "bg-amber-500/15 text-amber-300 border-amber-500/30",   // legacy
  "Under Revision": "bg-orange-500/15 text-orange-300 border-orange-500/30", // legacy
  "Accepted": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "Rejected": "bg-red-500/15 text-red-300 border-red-500/30",
}

const REC_BADGE: Record<string, string> = {
  "Accept": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "Minor Revision": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "Major Revision": "bg-orange-500/15 text-orange-300 border-orange-500/30",
  "Reject": "bg-red-500/15 text-red-300 border-red-500/30",
  "Peer Review": "bg-blue-500/15 text-blue-300 border-blue-500/30",
  "Desk Reject": "bg-red-500/15 text-red-300 border-red-500/30",
  "Pending": "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
}

const ROLE_STYLE: Record<string, { badge: string; accent: string }> = {
  "Editor": { badge: "bg-blue-500/15 text-blue-300 border-blue-500/30", accent: "border-l-blue-500" },
  "Reviewer": { badge: "bg-green-500/15 text-green-300 border-green-500/30", accent: "border-l-green-500" },
}

// ── Lanes ──────────────────────────────────────────────
// 4개 레인 — 1st/2nd/3rd 는 R1/R2/R3 뱃지로 카드 안에 흡수

interface LaneConfig {
  id: "review" | "revision" | "accepted" | "rejected"
  label: string
  sublabel: string  // 한 줄 부가설명 ("내 액션" / "저자 대기" 등)
  bg: string
  border: string
  headerBg: string
  dot: string
  text: string
}

const LANES: LaneConfig[] = [
  { id: "review",   label: "Under Review",   sublabel: "내 액션",   bg: "bg-amber-950/20",  border: "border-amber-800/40",  headerBg: "bg-amber-900/40",  dot: "bg-amber-400",  text: "text-amber-300" },
  { id: "revision", label: "Under Revision", sublabel: "저자 대기", bg: "bg-blue-950/20",   border: "border-blue-800/40",   headerBg: "bg-blue-900/40",   dot: "bg-blue-400",   text: "text-blue-300" },
  { id: "accepted", label: "Accepted",       sublabel: "완료",      bg: "bg-emerald-950/20",border: "border-emerald-800/40",headerBg: "bg-emerald-900/40",dot: "bg-emerald-400",text: "text-emerald-300" },
  { id: "rejected", label: "Rejected",       sublabel: "완료",      bg: "bg-zinc-950/40",   border: "border-zinc-700/40",   headerBg: "bg-zinc-800/60",   dot: "bg-red-400",    text: "text-zinc-300" },
]

const JOURNAL_BADGE: Record<string, string> = {
  "Neurospine": "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  "JMISST": "bg-purple-500/15 text-purple-300 border-purple-500/30",
  "KJNT": "bg-green-500/15 text-green-300 border-green-500/30",
  "Scientific Reports": "bg-orange-500/15 text-orange-300 border-orange-500/30",
  "PLOS ONE": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "World Neurosurgery": "bg-red-500/15 text-red-300 border-red-500/30",
  "Other": "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
}

// Compact labels for Methodology (19 options — 풀네임은 카드에 비좁음)
const METHOD_SHORT: Record<string, string> = {
  "Insurance Claims Big Data": "Insurance",
  "Single-Center Retrospective": "Single-Ctr",
  "Multicenter Retrospective": "Multi-Ctr",
  "Prospective Cohort": "Prospective",
  "RCT": "RCT",
  "Propensity Score Matching": "PSM",
  "Systematic Review": "SysRev",
  "Meta-Analysis": "Meta",
  "Case Series": "Series",
  "Case Report": "Case",
  "AI/Machine Learning": "AI/ML",
  "Deep Learning": "DL",
  "Biomechanical Study": "Biomech",
  "Cadaveric Study": "Cadaveric",
  "Survey Study": "Survey",
  "Technical Note": "Tech",
  "Narrative Review": "NarrRev",
  "Cross-Sectional Study": "XSect",
  "Registry Study": "Registry",
}

// ── Main ────────────────────────────────────────────────

export function Editorial() {
  const [roleFilter, setRoleFilter] = useState<EditorialRole | "all">("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [journalFilter, setJournalFilter] = useState<Set<string>>(new Set())
  const [methodFilter, setMethodFilter] = useState<Set<string>>(new Set())

  const { data: items, isLoading } = useQuery<EditorialItem[]>({
    queryKey: ["editorial"],
    queryFn: async () => {
      const res = await fetch("/api/notion/editorial")
      if (!res.ok) throw new Error("Editorial 데이터 로딩 실패")
      return res.json()
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })

  // Role filter 먼저 적용 (후속 요약/필터 전부 역할 기준)
  const roleFiltered = useMemo(() => {
    if (!items) return []
    if (roleFilter === "all") return items
    return items.filter(i => i.role === roleFilter)
  }, [items, roleFilter])

  // journals/methodologies 옵션 (role 필터 적용한 후의 데이터 기준)
  const availableJournals = useMemo(() => {
    const set = new Set<string>()
    for (const i of roleFiltered) if (i.journal) set.add(i.journal)
    return Array.from(set)
  }, [roleFiltered])

  const availableMethods = useMemo(() => {
    const counts = new Map<string, number>()
    for (const i of roleFiltered) {
      for (const m of i.methodology) counts.set(m, (counts.get(m) ?? 0) + 1)
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  }, [roleFiltered])

  // Apply journal + methodology + search
  const filtered = useMemo(() => {
    let out = roleFiltered
    if (journalFilter.size > 0) out = out.filter(i => i.journal && journalFilter.has(i.journal))
    if (methodFilter.size > 0) out = out.filter(i => i.methodology.some(m => methodFilter.has(m)))
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      out = out.filter(i =>
        i.name.toLowerCase().includes(q) ||
        i.manuscript_id.toLowerCase().includes(q) ||
        i.journal.toLowerCase().includes(q),
      )
    }
    return out
  }, [roleFiltered, journalFilter, methodFilter, searchQuery])

  // ── Urgent (Overdue + Due Soon) — pending 만 대상 ──
  // ── Lane buckets — status 기반 4개 ──
  const { urgent, lanes, awaitingCount, completedCount } = useMemo(() => {
    const urgent: EditorialItem[] = []
    const laneItems: Record<LaneConfig["id"], EditorialItem[]> = {
      review: [], revision: [], accepted: [], rejected: [],
    }

    for (const item of filtered) {
      // Lane 분류는 status 그대로
      if (item.status === "Accepted") laneItems.accepted.push(item)
      else if (item.status === "Rejected") laneItems.rejected.push(item)
      else if ((REVISION_STATUSES as readonly string[]).includes(item.status)) laneItems.revision.push(item)
      else laneItems.review.push(item)  // Received + *Review (+ legacy Under Review)

      // Urgent — Under Review 레인 + deadline overdue/soon 인 것만
      if (laneItems.review.includes(item)) {
        const dl = deadlineInfo(item.deadline)
        if (dl.urgency === "overdue" || dl.urgency === "soon") urgent.push(item)
      }
    }

    const byDeadline = (a: EditorialItem, b: EditorialItem) =>
      (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999")
    const byRecent = (a: EditorialItem, b: EditorialItem) =>
      (b.date_submitted ?? b.date_received ?? "").localeCompare(a.date_submitted ?? a.date_received ?? "")

    urgent.sort(byDeadline)
    laneItems.review.sort(byDeadline)
    laneItems.revision.sort(byRecent)
    laneItems.accepted.sort(byRecent)
    laneItems.rejected.sort(byRecent)

    return {
      urgent,
      lanes: laneItems,
      awaitingCount: laneItems.revision.length,
      completedCount: laneItems.accepted.length + laneItems.rejected.length,
    }
  }, [filtered])

  const overdue = useMemo(() => urgent.filter(i => {
    const dl = deadlineInfo(i.deadline)
    return dl.urgency === "overdue"
  }), [urgent])
  const soon = useMemo(() => urgent.filter(i => {
    const dl = deadlineInfo(i.deadline)
    return dl.urgency === "soon"
  }), [urgent])
  const completedItems = useMemo(
    () => [...lanes.accepted, ...lanes.rejected].sort((a, b) =>
      (b.date_submitted ?? b.date_received ?? "").localeCompare(a.date_submitted ?? a.date_received ?? "")
    ),
    [lanes.accepted, lanes.rejected],
  )

  // 이번달 완료 카운트 — terminal 상태이면서 date_submitted 가 이번달
  const thisMonthCompleted = useMemo(() => {
    const start = thisMonthStart()
    return completedItems.filter(i => {
      const d = i.date_submitted ?? i.date_received
      return d && d >= start
    }).length
  }, [completedItems])

  // Role 별 전체 카운트 (role 필터 무관, 원본 기준)
  const roleCounts = useMemo(() => {
    if (!items) return { editor: 0, reviewer: 0 }
    return {
      editor: items.filter(i => i.role === "Editor").length,
      reviewer: items.filter(i => i.role === "Reviewer").length,
    }
  }, [items])

  const pendingCount = lanes.review.length
  const totalShown = pendingCount + awaitingCount + completedCount

  function toggleJournal(j: string) {
    setJournalFilter(prev => {
      const next = new Set(prev)
      if (next.has(j)) next.delete(j)
      else next.add(j)
      return next
    })
  }

  function toggleMethod(m: string) {
    setMethodFilter(prev => {
      const next = new Set(prev)
      if (next.has(m)) next.delete(m)
      else next.add(m)
      return next
    })
  }

  function clearFilters() {
    setJournalFilter(new Set())
    setMethodFilter(new Set())
    setSearchQuery("")
  }

  const hasFilter = journalFilter.size > 0 || methodFilter.size > 0 || searchQuery.trim().length > 0

  if (isLoading) {
    return (
      <div className="space-y-3 animate-fade-in-up">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 bg-muted/60 rounded-xl" />)}
      </div>
    )
  }

  return (
    <div className="animate-fade-in-up space-y-4">
      {/* ─── Summary strip ───────────────────────── */}
      <div className="rounded-xl border border-border bg-card/40 px-3 py-2.5">
        <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap text-xs">
          <Pill color="red" label="Overdue" count={overdue.length} />
          <Pill color="amber" label="Due Soon" count={soon.length} />
          <Pill color="zinc" label="Pending" count={pendingCount} />
          <Pill color="blue" label="Awaiting" count={awaitingCount} icon="⏳" />
          <Pill color="emerald" label="This Month" count={thisMonthCompleted} icon="✅" />
          <span className="text-muted-foreground/40">|</span>
          <Pill color="blue" label="Editor" count={roleCounts.editor} icon="👤" />
          <Pill color="green" label="Reviewer" count={roleCounts.reviewer} icon="📝" />
        </div>
        {availableMethods.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-border/50">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Methodology</span>
            {availableMethods.slice(0, 6).map(([m, c]) => (
              <span key={m} className="text-[10px] text-muted-foreground">
                {METHOD_SHORT[m] ?? m} <span className="text-foreground/80 num">×{c}</span>
              </span>
            ))}
            {availableMethods.length > 6 && (
              <span className="text-[10px] text-muted-foreground/60">+{availableMethods.length - 6} more</span>
            )}
          </div>
        )}
      </div>

      {/* ─── Role tabs + search ─────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-muted border border-border rounded-lg p-0.5">
          {(["all", "Editor", "Reviewer"] as const).map(r => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                roleFilter === r ? "bg-indigo-600 text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r === "all" ? "All" : r}
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-[180px] relative">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="🔍 제목 · manuscript ID · journal"
            className="w-full bg-muted/40 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-indigo-500/60"
          />
        </div>
        {hasFilter && (
          <button
            onClick={clearFilters}
            className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            필터 초기화
          </button>
        )}
      </div>

      {/* ─── Journal filter chips ───────────────── */}
      {availableJournals.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 self-center">Journal</span>
          {availableJournals.map(j => {
            const active = journalFilter.has(j)
            return (
              <button
                key={j}
                onClick={() => toggleJournal(j)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                  active ? `${JOURNAL_BADGE[j] ?? ""} ring-1 ring-indigo-400/50` : "border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {j}
              </button>
            )
          })}
        </div>
      )}

      {/* ─── Methodology filter chips ───────────── */}
      {availableMethods.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 self-center">Method</span>
          {availableMethods.map(([m, c]) => {
            const active = methodFilter.has(m)
            return (
              <button
                key={m}
                onClick={() => toggleMethod(m)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                  active
                    ? "bg-indigo-500/20 text-indigo-300 border-indigo-400/50 ring-1 ring-indigo-400/40"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {METHOD_SHORT[m] ?? m} <span className="text-muted-foreground/60 num ml-0.5">{c}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="text-[11px] text-muted-foreground">
        {totalShown === 0
          ? "조건에 맞는 원고가 없습니다."
          : <>표시 중: <span className="text-foreground num">{pendingCount}</span>건 처리 필요 · <span className="num">{awaitingCount}</span>건 저자 대기 · <span className="num">{completedCount}</span>건 완료</>}
      </div>

      {/* ─── Overdue ──────────────────────────── */}
      {overdue.length > 0 && (
        <Section label="OVERDUE" count={overdue.length} icon="🔴" borderColor="border-red-500/30" bgColor="bg-red-500/[0.03]">
          {overdue.map(item => (
            <ManuscriptCard
              key={item.page_id}
              item={item}
              expanded={expandedId === item.page_id}
              onToggle={() => setExpandedId(expandedId === item.page_id ? null : item.page_id)}
              onJournalClick={toggleJournal}
              onMethodClick={toggleMethod}
            />
          ))}
        </Section>
      )}

      {/* ─── Due Soon ─────────────────────────── */}
      {soon.length > 0 && (
        <Section label="DUE SOON" count={soon.length} icon="🟡" borderColor="border-amber-500/30" bgColor="bg-amber-500/[0.03]">
          {soon.map(item => (
            <ManuscriptCard
              key={item.page_id}
              item={item}
              expanded={expandedId === item.page_id}
              onToggle={() => setExpandedId(expandedId === item.page_id ? null : item.page_id)}
              onJournalClick={toggleJournal}
              onMethodClick={toggleMethod}
            />
          ))}
        </Section>
      )}

      {/* ─── Lane View (4 lanes: Under Review / Under Revision / Accepted / Rejected) ─── */}
      <div className="overflow-x-auto scrollbar-hide -mx-3 px-3 md:mx-0 md:px-0">
        <div className="flex gap-3 min-w-[800px] md:min-w-0 md:grid md:grid-cols-4">
          {LANES.map((lane) => {
            const items = lane.id === "review" ? lanes.review
              : lane.id === "revision" ? lanes.revision
              : lane.id === "accepted" ? lanes.accepted
              : lanes.rejected
            return (
              <EditorialLane
                key={lane.id}
                lane={lane}
                items={items}
                expandedId={expandedId}
                onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                onJournalClick={toggleJournal}
                onMethodClick={toggleMethod}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── EditorialLane ───────────────────────────────────────
// Lane 별 기본 노출 개수 — 완료된 건들은 너무 많아 시각적으로 묶여 보이므로 일부만 보여주고 접기.
const LANE_DEFAULT_LIMIT: Partial<Record<LaneConfig["id"], number>> = {
  rejected: 5,
  accepted: 8,
}

function EditorialLane({
  lane, items, expandedId, onToggleExpand, onJournalClick, onMethodClick,
}: {
  lane: LaneConfig
  items: EditorialItem[]
  expandedId: string | null
  onToggleExpand: (id: string) => void
  onJournalClick: (j: string) => void
  onMethodClick: (m: string) => void
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const limit = LANE_DEFAULT_LIMIT[lane.id]
  const truncated = limit != null && items.length > limit && !showAll
  const visibleItems = truncated ? items.slice(0, limit) : items
  const hiddenCount = items.length - visibleItems.length

  return (
    <div className={`flex flex-col rounded-xl border ${lane.border} ${lane.bg} min-w-[200px] md:min-w-0`}>
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className={`flex items-center justify-between px-3 py-2.5 rounded-t-xl ${lane.headerBg} md:cursor-default`}
      >
        <div className="flex items-baseline gap-2">
          <span className={`size-2 rounded-full ${lane.dot}`} />
          <span className={`text-sm font-semibold ${lane.text}`}>{lane.label}</span>
          <span className="text-[10px] text-muted-foreground/70">{lane.sublabel}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground font-medium bg-card/60 px-1.5 py-0.5 rounded-full num">
            {items.length}
          </span>
          <ChevronDown className={`size-4 text-muted-foreground md:hidden transition-transform ${mobileOpen ? "rotate-180" : ""}`} />
        </div>
      </button>
      <div className={`flex flex-col gap-2 p-2 ${mobileOpen ? "" : "hidden md:flex"} max-h-[70vh] overflow-y-auto scrollbar-hide`}>
        {items.length === 0 ? (
          <div className="text-xs text-muted-foreground/60 text-center py-4">항목 없음</div>
        ) : (
          <>
            {visibleItems.map((item) => (
              <LaneCard
                key={item.page_id}
                item={item}
                laneId={lane.id}
                expanded={expandedId === item.page_id}
                onToggle={() => onToggleExpand(item.page_id)}
                onJournalClick={onJournalClick}
                onMethodClick={onMethodClick}
              />
            ))}
            {truncated && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="text-[11px] text-muted-foreground hover:text-foreground py-1.5 rounded border border-dashed border-border/60 hover:border-border transition-colors"
              >
                더보기 ({hiddenCount}건)
              </button>
            )}
            {!truncated && limit != null && items.length > limit && (
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className="text-[11px] text-muted-foreground/70 hover:text-foreground py-1 transition-colors"
              >
                접기
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── LaneCard (compact, lane 내부용) ────────────────────
function LaneCard({
  item, laneId, expanded, onToggle, onJournalClick, onMethodClick,
}: {
  item: EditorialItem
  laneId: LaneConfig["id"]
  expanded: boolean
  onToggle: () => void
  onJournalClick: (j: string) => void
  onMethodClick: (m: string) => void
}) {
  const dl = deadlineInfo(item.deadline)
  const role = ROLE_STYLE[item.role] ?? ROLE_STYLE.Reviewer
  const decision = item.recommendation
  const methShown = item.methodology.slice(0, 2)
  const methMore = item.methodology.length - methShown.length

  // 우측 상태 표시 — 레인별로 달라짐
  let rightSide: React.ReactNode
  if (laneId === "review") {
    rightSide = <span className={`text-[11px] num whitespace-nowrap ${dl.color}`}>{dl.text}</span>
  } else if (laneId === "revision") {
    rightSide = (
      <span className="text-[11px] num whitespace-nowrap text-blue-300/90">
        {item.date_submitted ? `Sub ${formatDate(item.date_submitted)}` : "—"}
      </span>
    )
  } else {
    // accepted / rejected — recommendation 강조
    rightSide = decision ? (
      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-[18px] font-medium ${REC_BADGE[decision] ?? ""}`}>
        {decision}
      </Badge>
    ) : null
  }

  return (
    <div className={`rounded-lg border border-border/80 bg-card overflow-hidden border-l-2 ${role.accent}`}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle() } }}
        className="px-2.5 py-2 cursor-pointer hover:bg-muted/40 transition-colors"
      >
        {/* Row 1: Role · Journal · R뱃지 · 우측 상태 */}
        <div className="flex items-center gap-1.5 mb-1">
          <Badge variant="outline" className={`text-[9px] px-1 py-0 h-[16px] font-medium ${role.badge}`}>
            {item.role[0]}
          </Badge>
          {item.journal && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onJournalClick(item.journal) }}
              className={`text-[9px] px-1.5 py-0 h-[16px] rounded-full border transition-colors ${JOURNAL_BADGE[item.journal] ?? ""}`}
              title="저널 필터"
            >
              {item.journal}
            </button>
          )}
          <Badge variant="outline" className={`text-[9px] px-1 py-0 h-[16px] font-medium ${STATUS_BADGE[item.status] ?? ""}`}>
            {item.status}
          </Badge>
          {item.review_round && (
            <span className="text-[9px] text-muted-foreground/80 bg-muted px-1 rounded num">R{item.review_round}</span>
          )}
          <span className="flex-1" />
          {rightSide}
        </div>
        {/* Row 2: Title */}
        <p className={`text-xs leading-snug ${laneId === "accepted" || laneId === "rejected" ? "text-muted-foreground" : "text-foreground"} ${expanded ? "" : "line-clamp-2"}`}>
          {item.name || "(제목 없음)"}
        </p>
        {/* Row 3: Methodology + meta */}
        {methShown.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap mt-1">
            {methShown.map(m => (
              <button
                key={m}
                type="button"
                onClick={e => { e.stopPropagation(); onMethodClick(m) }}
                className="text-[8px] px-1 py-0 h-[14px] rounded-full border border-indigo-400/30 bg-indigo-500/10 text-indigo-300/90"
                title="Methodology 필터"
              >
                {METHOD_SHORT[m] ?? m}
              </button>
            ))}
            {methMore > 0 && <span className="text-[8px] text-muted-foreground/60">+{methMore}</span>}
          </div>
        )}
      </div>

      {/* Expanded detail (inline) */}
      {expanded && (
        <div className="px-2.5 pb-2.5 pt-0 border-t border-border/50 bg-muted/20">
          <div className="py-2 flex items-center gap-1.5 text-[10px] text-muted-foreground/90 flex-wrap">
            <TimelineStep label="Rec" date={item.date_received} />
            <span className="text-muted-foreground/40">→</span>
            <TimelineStep label="Sub" date={item.date_submitted} />
            <span className="text-muted-foreground/40">→</span>
            <TimelineStep label="DL" date={item.deadline} />
          </div>
          {item.manuscript_id && (
            <div className="text-[10px] text-muted-foreground/80 mb-1 num">ID: {item.manuscript_id}</div>
          )}
          {item.notes && (
            <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-3 mt-1">{item.notes}</p>
          )}
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-1 mt-2 text-[10px] text-indigo-300 hover:text-indigo-200"
          >
            Notion에서 열기 →
          </a>
        </div>
      )}
    </div>
  )
}

// ── Pill ────────────────────────────────────────────────

function Pill({ color, label, count, icon }: { color: "red" | "amber" | "zinc" | "emerald" | "blue" | "green" | "purple"; label: string; count: number; icon?: string }) {
  const ring: Record<string, string> = {
    red: "text-red-400",
    amber: "text-amber-400",
    zinc: "text-foreground/80",
    emerald: "text-emerald-400",
    blue: "text-blue-400",
    green: "text-green-400",
    purple: "text-purple-400",
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {icon && <span>{icon}</span>}
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold num ${ring[color]}`}>{count}</span>
    </span>
  )
}

// ── Section ─────────────────────────────────────────────

function Section({
  label, count, icon, borderColor, bgColor, children,
}: {
  label: string; count: number; icon: string; borderColor: string; bgColor: string
  children: React.ReactNode
}) {
  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-3`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm">{icon}</span>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className="text-xs text-muted-foreground num">({count})</span>
      </div>
      <div className="space-y-2">
        {children}
      </div>
    </div>
  )
}

// ── ManuscriptCard ──────────────────────────────────────

function ManuscriptCard({
  item, expanded, onToggle, onJournalClick, onMethodClick, isCompleted, isAwaiting,
}: {
  item: EditorialItem
  expanded: boolean
  onToggle: () => void
  onJournalClick: (j: string) => void
  onMethodClick: (m: string) => void
  isCompleted?: boolean
  isAwaiting?: boolean
}) {
  const dl = deadlineInfo(item.deadline)
  const role = ROLE_STYLE[item.role] ?? ROLE_STYLE.Reviewer
  const decision = item.recommendation

  // role 별로 하단 메타 정보 강조를 다르게
  const isEditor = item.role === "Editor"
  const metaSummary = isEditor
    ? (item.reviewers ? `Reviewers · ${item.reviewers}` : null)
    : (item.date_submitted ? `Submitted · ${formatDate(item.date_submitted)}` : null)

  // Methodology 뱃지 (최대 3개 + "+N")
  const methShown = item.methodology.slice(0, 3)
  const methMore = item.methodology.length - methShown.length

  return (
    <div className={`rounded-lg border border-border/80 bg-card overflow-hidden border-l-2 ${role.accent}`}>
      {/* Card Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle() } }}
        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
      >
        {/* Left: info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-[18px] font-medium ${role.badge}`}>
              {item.role}
            </Badge>
            {item.journal && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onJournalClick(item.journal) }}
                className={`text-[10px] px-1.5 py-0 h-[18px] rounded-full border transition-colors ${JOURNAL_BADGE[item.journal] ?? ""} hover:ring-1 hover:ring-indigo-400/50`}
                title="저널 필터"
              >
                {item.journal}
              </button>
            )}
            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-[18px] font-medium ${STATUS_BADGE[item.status] ?? ""}`}>
              {item.status}
            </Badge>
            {item.review_round && (
              <span className="text-[10px] text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded num">R{item.review_round}</span>
            )}
            {/* Editor 에서는 Recommendation 을 카드 상단에 노출 (의사결정 맥락) */}
            {isEditor && decision && !isCompleted && (
              <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-[18px] font-medium ${REC_BADGE[decision] ?? ""}`}>
                → {decision}
              </Badge>
            )}
          </div>
          <p className={`text-sm leading-snug ${isCompleted ? "text-muted-foreground" : "text-foreground"} ${expanded ? "" : "line-clamp-1"}`}>
            {item.name || "(제목 없음)"}
          </p>
          {/* Methodology 뱃지 + role-specific meta */}
          {(methShown.length > 0 || metaSummary) && (
            <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
              {methShown.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={e => { e.stopPropagation(); onMethodClick(m) }}
                  className="text-[9px] px-1.5 py-0 h-[17px] rounded-full border border-indigo-400/30 bg-indigo-500/10 text-indigo-300/90 hover:bg-indigo-500/20 transition-colors"
                  title="Methodology 필터"
                >
                  {METHOD_SHORT[m] ?? m}
                </button>
              ))}
              {methMore > 0 && (
                <span className="text-[9px] text-muted-foreground/60">+{methMore}</span>
              )}
              {metaSummary && (
                <span className="text-[10px] text-muted-foreground/70 ml-1">{metaSummary}</span>
              )}
            </div>
          )}
        </div>

        {/* Right: deadline + notion */}
        <div className="flex items-center gap-2 shrink-0">
          {isCompleted && decision ? (
            <Badge variant="outline" className={`text-[10px] px-2 py-0.5 font-medium ${REC_BADGE[decision] ?? ""}`}>
              {decision}
            </Badge>
          ) : isAwaiting && item.date_submitted ? (
            <span className="text-xs num whitespace-nowrap text-purple-300/90">
              Submitted {formatDate(item.date_submitted)}
            </span>
          ) : (
            <span className={`text-xs num whitespace-nowrap ${dl.color}`}>{dl.text}</span>
          )}
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            className="p-1 rounded hover:bg-muted transition-colors shrink-0"
            title="Notion에서 열기"
          >
            <svg className="size-4 text-muted-foreground hover:text-foreground transition-colors" viewBox="0 0 100 100" fill="currentColor">
              <path d="M6.017 4.313l55.333-4.087c6.797-.583 8.543-.19 12.817 2.917l17.663 12.443c2.913 2.14 3.883 2.723 3.883 5.053v68.243c0 4.277-1.553 6.807-6.99 7.193L24.467 99.967c-4.08.193-6.023-.39-8.16-3.113L3.3 79.94c-2.333-3.113-3.3-5.443-3.3-8.167V11.113c0-3.497 1.553-6.413 6.017-6.8z" fillRule="evenodd" opacity=".6"/>
            </svg>
          </a>
        </div>
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div className="px-4 pb-3 pt-0 border-t border-border/50 bg-muted/20 animate-fade-in-up">
          {/* Timeline */}
          <div className="py-3 flex items-center gap-2 text-[11px] text-muted-foreground/90 flex-wrap">
            {item.review_round && <span className="num px-1.5 py-0.5 rounded bg-muted text-foreground/80">R{item.review_round}</span>}
            <TimelineStep label="Received" date={item.date_received} />
            <span className="text-muted-foreground/40">→</span>
            <TimelineStep label="Submitted" date={item.date_submitted} placeholder="—" />
            <span className="text-muted-foreground/40">→</span>
            <TimelineStep label="Deadline" date={item.deadline} placeholder="—" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-3 border-t border-border/30">
            <DetailField label="Manuscript ID" value={item.manuscript_id} />
            <DetailField label="Type" value={item.manuscript_type} />
            {item.recommendation && (
              <DetailField label="Recommendation">
                <Badge variant="outline" className={`text-[10px] ${REC_BADGE[item.recommendation] ?? ""}`}>
                  {item.recommendation}
                </Badge>
              </DetailField>
            )}
            {item.reviewers && <DetailField label="Reviewers" value={item.reviewers} />}
            {item.methodology.length > 0 && (
              <DetailField label="Methodology">
                <div className="flex gap-1 flex-wrap">
                  {item.methodology.map(m => (
                    <span key={m} className="text-[9px] px-1.5 py-0 rounded-full border border-indigo-400/30 bg-indigo-500/10 text-indigo-300/90">
                      {m}
                    </span>
                  ))}
                </div>
              </DetailField>
            )}
          </div>
          {item.notes && (
            <div className="pt-2 border-t border-border/30">
              <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1">Notes</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{item.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── TimelineStep ────────────────────────────────────────

function TimelineStep({ label, date, placeholder }: { label: string; date: string | null; placeholder?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">{label}</span>
      <span className={`text-[11px] num ${date ? "text-foreground/85" : "text-muted-foreground/50"}`}>
        {date ? formatDate(date) : placeholder ?? "—"}
      </span>
    </span>
  )
}

// ── DetailField ─────────────────────────────────────────

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-0.5">{label}</p>
      {children ?? <p className="text-xs text-foreground/90">{value || "—"}</p>}
    </div>
  )
}
