"use client"

import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import type { EditorialItem, EditorialRole } from "@/lib/types/editorial"
import { isTerminal } from "@/lib/editorial/status"

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

// ── Colors ──────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  "Received": "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  "Under Review": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "Under Revision": "bg-orange-500/15 text-orange-300 border-orange-500/30",
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

// ── Main ────────────────────────────────────────────────

export function Editorial() {
  const [roleFilter, setRoleFilter] = useState<EditorialRole | "all">("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)

  const { data: items, isLoading } = useQuery<EditorialItem[]>({
    queryKey: ["editorial"],
    queryFn: async () => {
      const res = await fetch("/api/notion/editorial")
      if (!res.ok) throw new Error("Editorial 데이터 로딩 실패")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const filtered = useMemo(() => {
    if (!items) return []
    if (roleFilter === "all") return items
    return items.filter(i => i.role === roleFilter)
  }, [items, roleFilter])

  // Group by urgency
  const { overdue, soon, inProgress, completed } = useMemo(() => {
    const overdue: EditorialItem[] = []
    const soon: EditorialItem[] = []
    const inProgress: EditorialItem[] = []
    const completed: EditorialItem[] = []

    for (const item of filtered) {
      if (isTerminal(item.status)) {
        completed.push(item)
        continue
      }
      const dl = deadlineInfo(item.deadline)
      if (dl.urgency === "overdue") overdue.push(item)
      else if (dl.urgency === "soon") soon.push(item)
      else inProgress.push(item)
    }

    // Sort by deadline (earliest first)
    const byDeadline = (a: EditorialItem, b: EditorialItem) =>
      (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999")
    overdue.sort(byDeadline)
    soon.sort(byDeadline)
    inProgress.sort(byDeadline)
    completed.sort((a, b) => (b.date_submitted ?? b.date_received ?? "").localeCompare(a.date_submitted ?? a.date_received ?? ""))

    return { overdue, soon, inProgress, completed }
  }, [filtered])

  const activeCount = overdue.length + soon.length + inProgress.length

  if (isLoading) {
    return (
      <div className="space-y-3 animate-fade-in-up">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 bg-muted/60 rounded-xl" />)}
      </div>
    )
  }

  return (
    <div className="animate-fade-in-up space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
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
        </div>
        <span className="text-muted-foreground text-xs">
          진행 <span className="text-foreground font-semibold num">{activeCount}</span>건
          {completed.length > 0 && <> · 완료 <span className="num">{completed.length}</span>건</>}
        </span>
      </div>

      {/* Overdue */}
      {overdue.length > 0 && (
        <Section
          label="OVERDUE"
          count={overdue.length}
          icon="🔴"
          borderColor="border-red-500/30"
          bgColor="bg-red-500/[0.03]"
        >
          {overdue.map(item => (
            <ManuscriptCard
              key={item.page_id}
              item={item}
              expanded={expandedId === item.page_id}
              onToggle={() => setExpandedId(expandedId === item.page_id ? null : item.page_id)}
            />
          ))}
        </Section>
      )}

      {/* Due Soon */}
      {soon.length > 0 && (
        <Section
          label="DUE SOON"
          count={soon.length}
          icon="🟡"
          borderColor="border-amber-500/30"
          bgColor="bg-amber-500/[0.03]"
        >
          {soon.map(item => (
            <ManuscriptCard
              key={item.page_id}
              item={item}
              expanded={expandedId === item.page_id}
              onToggle={() => setExpandedId(expandedId === item.page_id ? null : item.page_id)}
            />
          ))}
        </Section>
      )}

      {/* In Progress */}
      {inProgress.length > 0 && (
        <Section
          label="IN PROGRESS"
          count={inProgress.length}
          icon="⚪"
          borderColor="border-border"
          bgColor="bg-transparent"
        >
          {inProgress.map(item => (
            <ManuscriptCard
              key={item.page_id}
              item={item}
              expanded={expandedId === item.page_id}
              onToggle={() => setExpandedId(expandedId === item.page_id ? null : item.page_id)}
            />
          ))}
        </Section>
      )}

      {/* Empty */}
      {activeCount === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          진행 중인 원고가 없습니다.
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-2 w-full text-left group"
          >
            <div className="h-px flex-1 bg-border" />
            <span className="text-muted-foreground text-xs font-medium flex items-center gap-1.5 shrink-0">
              ✅ COMPLETED ({completed.length})
              <svg
                className={`size-3 transition-transform ${showCompleted ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
            <div className="h-px flex-1 bg-border" />
          </button>

          {showCompleted && (
            <div className="mt-3 space-y-2">
              {completed.map(item => (
                <ManuscriptCard
                  key={item.page_id}
                  item={item}
                  expanded={expandedId === item.page_id}
                  onToggle={() => setExpandedId(expandedId === item.page_id ? null : item.page_id)}
                  isCompleted
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
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
  item, expanded, onToggle, isCompleted,
}: {
  item: EditorialItem; expanded: boolean; onToggle: () => void; isCompleted?: boolean
}) {
  const dl = deadlineInfo(item.deadline)
  const role = ROLE_STYLE[item.role] ?? ROLE_STYLE.Reviewer
  const decision = item.recommendation

  return (
    <div className={`rounded-lg border border-border/80 bg-card overflow-hidden border-l-2 ${role.accent}`}>
      {/* Card Header — always visible */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle() } }}
        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
      >
        {/* Left: info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-[18px] font-medium ${role.badge}`}>
              {item.role}
            </Badge>
            <span className="text-[11px] text-muted-foreground">{item.journal || "—"}</span>
            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-[18px] font-medium ${STATUS_BADGE[item.status] ?? ""}`}>
              {item.status}
            </Badge>
            {item.review_round && (
              <span className="text-[10px] text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded num">R{item.review_round}</span>
            )}
          </div>
          <p className={`text-sm leading-snug ${isCompleted ? "text-muted-foreground" : "text-foreground"} ${expanded ? "" : "line-clamp-1"}`}>
            {item.name}
          </p>
        </div>

        {/* Right: deadline + notion */}
        <div className="flex items-center gap-2 shrink-0">
          {isCompleted && decision ? (
            <Badge variant="outline" className={`text-[10px] px-2 py-0.5 font-medium ${REC_BADGE[decision] ?? ""}`}>
              {decision}
            </Badge>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-3">
            <DetailField label="Manuscript ID" value={item.manuscript_id} />
            <DetailField label="Type" value={item.manuscript_type} />
            <DetailField label="Received" value={formatDate(item.date_received)} />
            <DetailField label="Deadline" value={formatDate(item.deadline)} />
            {item.date_submitted && <DetailField label="Submitted" value={formatDate(item.date_submitted)} />}
            {item.recommendation && (
              <DetailField label="Recommendation">
                <Badge variant="outline" className={`text-[10px] ${REC_BADGE[item.recommendation] ?? ""}`}>
                  {item.recommendation}
                </Badge>
              </DetailField>
            )}
            {item.reviewers && <DetailField label="Reviewers" value={item.reviewers} />}
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

// ── DetailField ─────────────────────────────────────────

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-0.5">{label}</p>
      {children ?? <p className="text-xs text-foreground/90">{value || "—"}</p>}
    </div>
  )
}
