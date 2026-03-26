"use client"

import { useState, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Clock,
  CheckCircle2,
  Timer,
  AlertTriangle,
  ArrowRight,
  FileText,
  Tag,
} from "lucide-react"

// ── Types ────────────────────────────────────────────────────

type ReviewStatus = "Assigned" | "In Review" | "Draft Ready"
type Decision = "Accept" | "Minor Revision" | "Major Revision" | "Reject"

interface QueueItem {
  id: string
  title: string
  type: string
  status: ReviewStatus
  round: number
  tags: string[]
  dueDate: string
  assignedDate: string
}

interface HistoryItem {
  id: string
  title: string
  round: number
  decision: Decision
  turnaround: number
}

// ── Sample Data ──────────────────────────────────────────────

const QUEUE_ITEMS: QueueItem[] = [
  {
    id: "NS-26-142",
    title: "AI-Assisted Pedicle Screw Placement Using Intraoperative CT Navigation",
    type: "Original Article",
    status: "In Review",
    round: 1,
    tags: ["AI", "Navigation"],
    dueDate: "2026-03-30",
    assignedDate: "2026-03-20",
  },
  {
    id: "NS-26-158",
    title: "Machine Learning Prediction of Adjacent Segment Disease After Lumbar Fusion",
    type: "Original Article",
    status: "Assigned",
    round: 1,
    tags: ["AI", "Lumbar", "Fusion"],
    dueDate: "2026-04-05",
    assignedDate: "2026-03-25",
  },
  {
    id: "NS-26-131",
    title: "Deep Learning for Automated Cervical Disc Herniation Detection on MRI",
    type: "Original Article",
    status: "Draft Ready",
    round: 2,
    tags: ["AI", "Cervical", "DL"],
    dueDate: "2026-03-28",
    assignedDate: "2026-03-10",
  },
]

const HISTORY_ITEMS: HistoryItem[] = [
  { id: "NS-25-892", title: "Natural Language Processing for Spine Surgery Clinical Notes", round: 2, decision: "Accept", turnaround: 14 },
  { id: "NS-25-876", title: "Federated Learning for Multi-Center Spinal Cord Injury Data", round: 1, decision: "Major Revision", turnaround: 21 },
  { id: "NS-25-845", title: "Computer Vision for Intraoperative Spinal Alignment Assessment", round: 3, decision: "Accept", turnaround: 8 },
  { id: "NS-25-801", title: "Radiomics-Based Prediction of Osteoporotic Vertebral Fracture Outcome", round: 1, decision: "Minor Revision", turnaround: 18 },
  { id: "NS-25-789", title: "GPT-4 Performance in Spine Surgery Board Examination Questions", round: 1, decision: "Reject", turnaround: 12 },
]

// ── Color configs ────────────────────────────────────────────

const STATUS_COLORS: Record<ReviewStatus, string> = {
  "Assigned": "bg-blue-500/15 text-blue-300 border-blue-500/30",
  "In Review": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "Draft Ready": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
}

const DECISION_COLORS: Record<Decision, string> = {
  "Accept": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "Minor Revision": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "Major Revision": "bg-orange-500/15 text-orange-300 border-orange-500/30",
  "Reject": "bg-red-500/15 text-red-300 border-red-500/30",
}

const TAG_COLORS: Record<string, string> = {
  AI: "bg-purple-500/15 text-purple-300",
  Navigation: "bg-sky-500/15 text-sky-300",
  Lumbar: "bg-teal-500/15 text-teal-300",
  Fusion: "bg-orange-500/15 text-orange-300",
  Cervical: "bg-rose-500/15 text-rose-300",
  DL: "bg-indigo-500/15 text-indigo-300",
  Spine: "bg-blue-500/15 text-blue-300",
}

// ── Workflow stages ──────────────────────────────────────────

const WORKFLOW_STAGES = ["Assigned", "In Review", "Draft Ready", "EIC Submitted", "Complete"] as const

// ── Main Component ───────────────────────────────────────────

export function Editorial() {
  const [view, setView] = useState<"queue" | "history">("queue")

  const metrics = useMemo(() => {
    const pending = QUEUE_ITEMS.length
    const completed = HISTORY_ITEMS.length
    const avgTurnaround = completed > 0
      ? Math.round(HISTORY_ITEMS.reduce((sum, h) => sum + h.turnaround, 0) / completed)
      : 0
    const now = new Date()
    const dueSoon = QUEUE_ITEMS.filter((item) => {
      const due = new Date(item.dueDate)
      const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return diffDays <= 5 && diffDays >= 0
    }).length

    return { pending, completed, avgTurnaround, dueSoon }
  }, [])

  const sortedQueue = useMemo(() =>
    [...QUEUE_ITEMS].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
    []
  )

  return (
    <div className="animate-fade-in-up space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-white">Editorial Review</h2>
        <Badge variant="secondary" className="bg-zinc-800 text-zinc-300 border border-zinc-700">
          Neurospine
        </Badge>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          icon={<Clock className="size-4 text-blue-400" />}
          label="Pending Reviews"
          value={metrics.pending}
          accent="text-blue-300"
        />
        <MetricCard
          icon={<CheckCircle2 className="size-4 text-emerald-400" />}
          label="Completed"
          value={metrics.completed}
          accent="text-emerald-300"
        />
        <MetricCard
          icon={<Timer className="size-4 text-indigo-400" />}
          label="Avg Turnaround"
          value={`${metrics.avgTurnaround}d`}
          accent="text-indigo-300"
        />
        <MetricCard
          icon={<AlertTriangle className="size-4 text-amber-400" />}
          label="Due Soon"
          value={metrics.dueSoon}
          accent="text-amber-300"
        />
      </div>

      {/* View Toggle */}
      <div className="flex gap-1 bg-zinc-800 border border-zinc-700 rounded-lg p-1 w-fit">
        <button
          onClick={() => setView("queue")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            view === "queue"
              ? "bg-indigo-600 text-white"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Review Queue
        </button>
        <button
          onClick={() => setView("history")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            view === "history"
              ? "bg-indigo-600 text-white"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          History
        </button>
      </div>

      {/* Content */}
      {view === "queue" ? (
        <QueueView items={sortedQueue} />
      ) : (
        <HistoryView items={HISTORY_ITEMS} />
      )}

      {/* Workflow Visualization */}
      <WorkflowVisualization queueItems={QUEUE_ITEMS} />
    </div>
  )
}

// ── Metric Card ──────────────────────────────────────────────

function MetricCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  accent: string
}) {
  return (
    <div className="card-hover rounded-xl border border-zinc-700/50 bg-zinc-900/60 p-3.5">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-zinc-400">{label}</span>
      </div>
      <span className={`num text-2xl font-bold ${accent}`}>{value}</span>
    </div>
  )
}

// ── Queue View ───────────────────────────────────────────────

function QueueView({ items }: { items: QueueItem[] }) {
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const now = new Date()
        const due = new Date(item.dueDate)
        const daysRemaining = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        const isUrgent = daysRemaining <= 3

        return (
          <div
            key={item.id}
            className="card-hover rounded-xl border border-zinc-700/50 bg-zinc-900/60 p-4 transition-all duration-200 hover:border-zinc-600/60"
          >
            <div className="flex items-start justify-between gap-3">
              {/* Left */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="num text-sm font-semibold text-zinc-100">{item.id}</span>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-medium ${STATUS_COLORS[item.status]}`}>
                    {item.status}
                  </Badge>
                  <span className="num text-[10px] font-medium text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                    R{item.round}
                  </span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium bg-zinc-500/10 text-zinc-400 border-zinc-500/30">
                    {item.type}
                  </Badge>
                </div>
                <p className="text-sm text-zinc-300 line-clamp-1 mb-2">
                  {item.title}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TAG_COLORS[tag] || "bg-zinc-500/15 text-zinc-400"}`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Right - Due date */}
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className={`num text-xs font-medium ${isUrgent ? "text-red-400" : "text-zinc-400"}`}>
                  {formatDisplayDate(item.dueDate)}
                </span>
                <span className={`num text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  isUrgent
                    ? "bg-red-500/15 text-red-300"
                    : "bg-zinc-800 text-zinc-400"
                }`}>
                  {daysRemaining < 0 ? `${Math.abs(daysRemaining)}d overdue` : `${daysRemaining}d left`}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── History View ─────────────────────────────────────────────

function HistoryView({ items }: { items: HistoryItem[] }) {
  return (
    <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/60 overflow-hidden">
      {/* Table Header */}
      <div className="grid grid-cols-[100px_1fr_60px_120px_90px] gap-2 px-4 py-2.5 bg-zinc-800/80 border-b border-zinc-700/50 text-xs text-zinc-400 font-medium">
        <span>ID</span>
        <span>Title</span>
        <span>Round</span>
        <span>Decision</span>
        <span className="text-right">Turnaround</span>
      </div>
      {/* Table Body */}
      {items.map((item) => (
        <div
          key={item.id}
          className="grid grid-cols-[100px_1fr_60px_120px_90px] gap-2 px-4 py-3 border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 transition-colors items-center"
        >
          <span className="num text-sm font-medium text-zinc-200">{item.id}</span>
          <span className="text-sm text-zinc-300 truncate" title={item.title}>
            {item.title}
          </span>
          <span className="num text-sm text-zinc-400">R{item.round}</span>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-medium w-fit ${DECISION_COLORS[item.decision]}`}>
            {item.decision}
          </Badge>
          <span className="num text-sm text-zinc-400 text-right">{item.turnaround}d</span>
        </div>
      ))}
    </div>
  )
}

// ── Workflow Visualization ───────────────────────────────────

function WorkflowVisualization({ queueItems }: { queueItems: QueueItem[] }) {
  // Count items at each workflow stage
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const stage of WORKFLOW_STAGES) {
      counts[stage] = 0
    }
    for (const item of queueItems) {
      if (item.status in counts) {
        counts[item.status]++
      }
    }
    return counts
  }, [queueItems])

  return (
    <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/60 p-4">
      <h3 className="text-sm font-semibold text-zinc-300 mb-4">Review Workflow</h3>
      <div className="flex items-center justify-between gap-1 overflow-x-auto">
        {WORKFLOW_STAGES.map((stage, i) => {
          const count = stageCounts[stage] || 0
          const isActive = count > 0

          return (
            <div key={stage} className="flex items-center gap-1 flex-shrink-0">
              <div className={`flex flex-col items-center gap-1.5 px-3 py-2 rounded-lg border transition-colors ${
                isActive
                  ? "border-indigo-500/40 bg-indigo-950/30"
                  : "border-zinc-700/30 bg-zinc-800/40"
              }`}>
                <span className={`text-[11px] font-medium whitespace-nowrap ${
                  isActive ? "text-indigo-300" : "text-zinc-500"
                }`}>
                  {stage}
                </span>
                {/* Dots representing items */}
                {count > 0 && (
                  <div className="flex gap-1">
                    {Array.from({ length: count }).map((_, j) => (
                      <span key={j} className="size-2 rounded-full bg-indigo-400" />
                    ))}
                  </div>
                )}
              </div>
              {i < WORKFLOW_STAGES.length - 1 && (
                <ArrowRight className="size-3.5 text-zinc-600 flex-shrink-0" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
