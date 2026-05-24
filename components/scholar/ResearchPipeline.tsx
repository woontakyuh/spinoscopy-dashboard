"use client"

import { useState, useCallback, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Plus,
  ExternalLink,
  Save,
  X,
  ChevronDown,
  Calendar,
  BookOpen,
  Users,
  FileText,
  AlertTriangle,
  StickyNote,
} from "lucide-react"
import type {
  ResearchProject,
  ResearchStatus,
  ResearchCreateInput,
  ResearchUpdateInput,
} from "@/lib/types/research"
import { RESEARCH_STATUSES, STATUS_LABELS, KNOWN_JOURNALS } from "@/lib/types/research"

// ── Lane Config ─────────────────────────────────────────────

interface LaneConfig {
  id: string
  label: string
  statuses: ResearchStatus[]
  color: string
  bg: string
  border: string
  dot: string
  headerBg: string
  /** 메인 리스트 아래에 별도로 표시할 하위 그룹들 (terminal/inactive 상태 종합) */
  subgroups?: Array<{
    id: string
    label: string
    statuses: ResearchStatus[]
    /** true 면 기본 접힘, 클릭으로 펼침 */
    collapsible?: boolean
  }>
}

const LANES: LaneConfig[] = [
  {
    id: "idea",
    label: "Idea / Lit Review",
    statuses: ["Idea", "Lit Review", "WNS"],
    color: "text-foreground/90",
    bg: "bg-muted/50",
    border: "border-border/50",
    dot: "bg-zinc-400",
    headerBg: "bg-muted",
    subgroups: [
      { id: "hold", label: "Hold", statuses: ["Hold"], collapsible: true },
    ],
  },
  {
    id: "drafting",
    label: "Drafting / Editing",
    statuses: ["Drafting", "Editing", "Manuscript drafting", "\bManscript drafting"],
    color: "text-indigo-300",
    bg: "bg-indigo-950/30",
    border: "border-indigo-800/40",
    dot: "bg-indigo-400",
    headerBg: "bg-indigo-900/40",
  },
  {
    id: "submitted",
    label: "Submitted",
    statuses: ["Submitted", "Under Review", "2nd Review"],
    color: "text-cyan-300",
    bg: "bg-cyan-950/30",
    border: "border-cyan-800/40",
    dot: "bg-cyan-400",
    headerBg: "bg-cyan-900/40",
  },
  {
    id: "revision",
    label: "Revision",
    statuses: ["Revision"],
    color: "text-amber-300",
    bg: "bg-amber-950/30",
    border: "border-amber-800/40",
    dot: "bg-amber-400",
    headerBg: "bg-amber-900/40",
  },
  {
    id: "accepted",
    label: "Accepted",
    statuses: ["Accepted"],
    color: "text-emerald-300",
    bg: "bg-emerald-950/30",
    border: "border-emerald-800/40",
    dot: "bg-emerald-400",
    headerBg: "bg-emerald-900/40",
    subgroups: [
      { id: "rejected", label: "Rejected", statuses: ["Rejected"] },
    ],
  },
]

// Status → color config for individual cards
const STATUS_DOT: Record<string, { dot: string; label: string }> = {
  Idea: { dot: "bg-zinc-300", label: "Idea" },
  "Lit Review": { dot: "bg-zinc-400", label: "Lit Review" },
  WNS: { dot: "bg-zinc-400", label: "Lit Review" },
  Drafting: { dot: "bg-indigo-400", label: "Drafting" },
  "Manuscript drafting": { dot: "bg-indigo-400", label: "Drafting" },
  "\bManscript drafting": { dot: "bg-indigo-400", label: "Drafting" },
  Editing: { dot: "bg-amber-400", label: "Editing" },
  Submitted: { dot: "bg-cyan-400", label: "Submitted" },
  Revision: { dot: "bg-yellow-400", label: "Revision" },
  "2nd Review": { dot: "bg-blue-400", label: "2nd Review" },
  Accepted: { dot: "bg-emerald-400", label: "Accepted" },
  Published: { dot: "bg-emerald-500", label: "Published" },
  Rejected: { dot: "bg-red-400", label: "Rejected" },
  Hold: { dot: "bg-zinc-500", label: "Hold" },
}

// Known options for select fields
const KNOWN_AUTHORS = [
  "여운탁", "김준회", "김태신", "안경득", "정천기", "최일",
  "박성민", "이승환", "조규정", "김세훈", "이재협",
]

// ── Main Component ───────────────────────────────────────────

export function ResearchPipeline() {
  const queryClient = useQueryClient()
  const [selectedProject, setSelectedProject] = useState<ResearchProject | null>(null)
  // CreateDialog 제거 — Notion에서 직접 추가
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null)

  const { data: projects, isLoading, isError } = useQuery<ResearchProject[]>({
    queryKey: ["research-projects"],
    queryFn: async () => {
      const res = await fetch("/api/notion/research")
      if (!res.ok) throw new Error("Failed to fetch research projects")
      const all: ResearchProject[] = await res.json()
      // Published는 My Papers에서 확인 → Research에서 제외
      return all.filter(p => p.status !== "Published")
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({
      pageId,
      updates,
    }: {
      pageId: string
      updates: ResearchUpdateInput
    }) => {
      const res = await fetch("/api/notion/research", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, updates }),
      })
      if (!res.ok) throw new Error("Failed to update project")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["research-projects"] })
    },
  })

  const projectsByLane = useCallback(
    (lane: LaneConfig) =>
      (projects ?? []).filter((p) => lane.statuses.includes(p.status)),
    [projects]
  )

  if (isLoading) return <PipelineSkeleton />
  if (isError)
    return (
      <div className="text-red-400 p-4">
        연구 데이터를 불러오는 데 실패했습니다.
      </div>
    )

  const totalCount = projects?.length ?? 0

  return (
    <div className="animate-fade-in-up space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-foreground">연구 파이프라인</h2>
          <Badge variant="secondary" className="bg-muted text-foreground/90 border border-border">
            {totalCount}건
          </Badge>
        </div>
        <a
          href="https://www.notion.so/c222e1a30c074227bb6cb26365cd0509"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
        >
          <Plus className="size-4" />
          새 연구 (Notion)
        </a>
      </div>

      {/* Kanban Board - 5 Lanes */}
      <div className="overflow-x-auto scrollbar-hide -mx-3 px-3 md:mx-0 md:px-0">
        <div className="flex gap-3 min-w-[1000px] md:min-w-0 md:grid md:grid-cols-5">
          {LANES.map((lane) => {
            const items = projectsByLane(lane)
            const isExpanded = mobileExpanded === lane.id

            return (
              <div
                key={lane.id}
                className={`flex flex-col rounded-xl border ${lane.border} ${lane.bg} min-w-[200px] md:min-w-0`}
              >
                {/* Column Header */}
                <button
                  onClick={() =>
                    setMobileExpanded(isExpanded ? null : lane.id)
                  }
                  className={`flex items-center justify-between px-3 py-2.5 rounded-t-xl ${lane.headerBg} md:cursor-default`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`size-2 rounded-full ${lane.dot}`} />
                    <span className={`text-sm font-semibold ${lane.color}`}>
                      {lane.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground font-medium bg-card/60 px-1.5 py-0.5 rounded-full">
                      {items.length}
                    </span>
                    <ChevronDown
                      className={`size-4 text-muted-foreground md:hidden transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </button>

                {/* Cards */}
                <div
                  className={`flex flex-col gap-2 p-2 ${
                    isExpanded ? "" : "hidden md:flex"
                  } max-h-[60vh] overflow-y-auto scrollbar-hide`}
                >
                  {items.length === 0 && (!lane.subgroups || lane.subgroups.every((sg) => (projects ?? []).filter((p) => sg.statuses.includes(p.status)).length === 0)) ? (
                    <div className="text-xs text-muted-foreground/70 text-center py-4">
                      항목 없음
                    </div>
                  ) : (
                    <>
                      {items.map((project) => (
                        <ProjectCard
                          key={project.page_id}
                          project={project}
                          lane={lane}
                          showSubStatus={lane.statuses.length > 1}
                          isSelected={
                            selectedProject?.page_id === project.page_id
                          }
                          onClick={() =>
                            setSelectedProject(
                              selectedProject?.page_id === project.page_id
                                ? null
                                : project
                            )
                          }
                        />
                      ))}
                      {lane.subgroups?.map((sg) => {
                        const sgItems = (projects ?? []).filter((p) => sg.statuses.includes(p.status))
                        if (sgItems.length === 0) return null
                        return (
                          <SubgroupSection
                            key={sg.id}
                            subgroup={sg}
                            items={sgItems}
                            lane={lane}
                            selectedProject={selectedProject}
                            onSelectProject={setSelectedProject}
                          />
                        )
                      })}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail Panel */}
      {selectedProject && (
        <DetailPanel
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
          onSave={(updates) => {
            updateMutation.mutate({
              pageId: selectedProject.page_id,
              updates,
            })
            // Optimistically update local state
            setSelectedProject({ ...selectedProject, ...mapUpdatesToProject(updates) })
          }}
          isSaving={updateMutation.isPending}
        />
      )}

      {/* 새 연구 추가는 Notion에서 직접 */}
    </div>
  )
}

// ── Project Card ─────────────────────────────────────────────

// ── Subgroup section (e.g. Hold under Idea/Lit Review, Rejected under Accepted) ──
function SubgroupSection({
  subgroup,
  items,
  lane,
  selectedProject,
  onSelectProject,
}: {
  subgroup: NonNullable<LaneConfig["subgroups"]>[number]
  items: ResearchProject[]
  lane: LaneConfig
  selectedProject: ResearchProject | null
  onSelectProject: (p: ResearchProject | null) => void
}) {
  const [open, setOpen] = useState(!subgroup.collapsible)
  const headerLabel = (
    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      <span>{subgroup.label}</span>
      <span className="text-muted-foreground/70 num">({items.length})</span>
    </span>
  )
  return (
    <div className="mt-2 pt-2 border-t border-border/40">
      {subgroup.collapsible ? (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between py-1 px-1 hover:bg-muted/40 rounded transition-colors"
          aria-expanded={open}
        >
          {headerLabel}
          <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      ) : (
        <div className="px-1 py-1">{headerLabel}</div>
      )}
      {open && (
        <div className="flex flex-col gap-2 mt-1.5">
          {items.map((project) => (
            <ProjectCard
              key={project.page_id}
              project={project}
              lane={lane}
              showSubStatus={true}
              isSelected={selectedProject?.page_id === project.page_id}
              onClick={() =>
                onSelectProject(selectedProject?.page_id === project.page_id ? null : project)
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectCard({
  project,
  lane,
  showSubStatus,
  isSelected,
  onClick,
}: {
  project: ResearchProject
  lane: LaneConfig
  showSubStatus: boolean
  isSelected: boolean
  onClick: () => void
}) {
  const warning = getProjectWarning(project)
  const statusInfo = STATUS_DOT[project.status]

  return (
    <button
      onClick={onClick}
      className={`card-hover text-left w-full rounded-lg border p-2.5 transition-all duration-200 ${
        isSelected
          ? "border-indigo-500/60 bg-indigo-950/30 ring-1 ring-indigo-500/30"
          : "border-border/40 bg-card/60 hover:border-border/60 hover:bg-muted/60"
      }`}
    >
      {/* Sub-status badge (for merged lanes like Drafting/Editing) */}
      {showSubStatus && (
        <div className="mb-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted/80 px-1.5 py-0.5 rounded">
            <span className={`size-1.5 rounded-full ${statusInfo.dot}`} />
            {statusInfo.label}
          </span>
        </div>
      )}

      {/* Revision sub-decision badge (Minor / Major) */}
      {project.status === "Revision" && project.decision && (project.decision === "Minor Revision" || project.decision === "Major Revision") && (
        <div className="mb-1.5">
          <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
            project.decision === "Major Revision"
              ? "bg-orange-950/50 text-orange-300 border-orange-700/40"
              : "bg-amber-950/40 text-amber-300 border-amber-700/40"
          }`}>
            {project.decision}
          </span>
        </div>
      )}

      {/* Title */}
      <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug mb-2">
        {project.title}
      </p>

      {/* Target Journal */}
      {project.target_journal && (
        <div className="mb-2">
          <JournalBadge journal={project.target_journal} />
        </div>
      )}

      {/* Author info */}
      <div className="flex items-center gap-1 mb-1.5">
        {project.first_author.length > 0 && (
          <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">
            <Users className="size-3 inline mr-0.5 -mt-px" />
            1st: {project.first_author[0]}
            {project.first_author.length > 1 && ` +${project.first_author.length - 1}`}
          </span>
        )}
      </div>
      {project.corresponding.length > 0 && (
        <div className="mb-1.5">
          <span className="text-[10px] text-muted-foreground truncate block">
            Corr: {project.corresponding[0]}
            {project.corresponding.length > 1 && ` +${project.corresponding.length - 1}`}
          </span>
        </div>
      )}

      {/* Warning */}
      {warning && (
        <div className="flex items-center gap-1 mb-1.5 px-1.5 py-0.5 bg-amber-950/40 border border-amber-800/30 rounded text-[10px] text-amber-300">
          <AlertTriangle className="size-3 flex-shrink-0" />
          <span>{warning}</span>
        </div>
      )}

      {/* Footer: date */}
      <div className="flex items-center justify-end">
        {project.start_date && (
          <span className="num text-[10px] text-muted-foreground whitespace-nowrap flex items-center gap-0.5">
            <Calendar className="size-2.5" />
            {formatDate(project.start_date)}
          </span>
        )}
      </div>
    </button>
  )
}

// ── Detail Panel ─────────────────────────────────────────────

function DetailPanel({
  project,
  onClose,
  onSave,
  isSaving,
}: {
  project: ResearchProject
  onClose: () => void
  onSave: (updates: ResearchUpdateInput) => void
  isSaving: boolean
}) {
  const [title, setTitle] = useState(project.title)
  const [status, setStatus] = useState(project.status)
  const [firstAuthor, setFirstAuthor] = useState(project.first_author.join(", "))
  const [corresponding, setCorresponding] = useState(project.corresponding.join(", "))
  const [targetJournal, setTargetJournal] = useState(project.target_journal)
  const [startDate, setStartDate] = useState(project.start_date ?? "")
  const [publishDate, setPublishDate] = useState(project.publish_date ?? "")
  const [memo, setMemo] = useState("")
  const [showPublishedNote, setShowPublishedNote] = useState(false)

  // Re-sync when project changes
  const [prevId, setPrevId] = useState(project.page_id)
  if (project.page_id !== prevId) {
    setPrevId(project.page_id)
    setTitle(project.title)
    setStatus(project.status)
    setFirstAuthor(project.first_author.join(", "))
    setCorresponding(project.corresponding.join(", "))
    setTargetJournal(project.target_journal)
    setStartDate(project.start_date ?? "")
    setPublishDate(project.publish_date ?? "")
    setMemo("")
    setShowPublishedNote(false)
  }

  function handleStatusChange(newStatus: ResearchStatus) {
    setStatus(newStatus)
    setShowPublishedNote(newStatus === "Published")
  }

  function handleSave() {
    const parseList = (s: string) =>
      s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)

    onSave({
      title,
      status,
      firstAuthor: parseList(firstAuthor),
      corresponding: parseList(corresponding),
      targetJournal,
      startDate: startDate || null,
      publishDate: publishDate || null,
    })
  }

  return (
    <div className="animate-fade-in-up rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm p-4 md:p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-indigo-400" />
          <span className="text-sm font-semibold text-foreground">프로젝트 상세</span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-indigo-400 transition-colors flex items-center gap-1"
          >
            <ExternalLink className="size-3" />
            Notion
          </a>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground/90 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Form Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        {/* Title - full width */}
        <div className="md:col-span-2">
          <label className="text-xs text-muted-foreground mb-1 block">제목</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-muted/80 border-border text-foreground text-sm"
          />
        </div>

        {/* Status */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">상태</label>
          <Select value={status} onValueChange={(v) => handleStatusChange(v as ResearchStatus)}>
            <SelectTrigger className="w-full bg-muted/80 border-border text-foreground text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-muted border-border">
              {RESEARCH_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="text-foreground">
                  <span className="flex items-center gap-2">
                    <span className={`size-2 rounded-full ${STATUS_DOT[s].dot}`} />
                    {STATUS_LABELS[s]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {showPublishedNote && (
            <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
              <AlertTriangle className="size-3" />
              Published로 변경 시 My Papers로 이동 대상
            </p>
          )}
        </div>

        {/* Target Journal */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Target Journal</label>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {KNOWN_JOURNALS.map((j) => (
              <button key={j} type="button" onClick={() => setTargetJournal(j)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors border ${
                  targetJournal === j
                    ? "bg-indigo-600/30 text-indigo-300 border-indigo-500/50"
                    : "bg-muted text-muted-foreground border-border hover:text-foreground/90"
                }`}
              >{j}</button>
            ))}
          </div>
          <Input
            value={targetJournal}
            onChange={(e) => setTargetJournal(e.target.value)}
            placeholder="또는 저널명 직접 입력"
            className="bg-muted/80 border-border text-foreground text-sm"
          />
        </div>

        {/* 1st Author */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">1st Author (쉼표 구분)</label>
          <Input
            value={firstAuthor}
            onChange={(e) => setFirstAuthor(e.target.value)}
            placeholder="예: 김준회, 여운탁"
            className="bg-muted/80 border-border text-foreground text-sm"
          />
        </div>

        {/* Corresponding */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Corresponding (쉼표 구분)</label>
          <Input
            value={corresponding}
            onChange={(e) => setCorresponding(e.target.value)}
            placeholder="예: 여운탁"
            className="bg-muted/80 border-border text-foreground text-sm"
          />
        </div>

        {/* Start Date */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">시작일</label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="num bg-muted/80 border-border text-foreground text-sm"
          />
        </div>

        {/* Publish Date */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">출판일</label>
          <Input
            type="date"
            value={publishDate}
            onChange={(e) => setPublishDate(e.target.value)}
            className="num bg-muted/80 border-border text-foreground text-sm"
          />
        </div>

        {/* Inline Memo */}
        <div className="md:col-span-2">
          <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <StickyNote className="size-3" />
            메모 (로컬 전용)
          </label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="빠른 메모를 입력하세요..."
            rows={2}
            className="w-full rounded-md bg-muted/80 border border-border text-foreground text-sm px-3 py-2 resize-none placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50"
          />
        </div>
      </div>

      {/* Save */}
      <div className="mt-4 flex justify-end">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving}
          className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5"
        >
          <Save className="size-3.5" />
          {isSaving ? "저장 중..." : "저장"}
        </Button>
      </div>
    </div>
  )
}

// ── Create Dialog ────────────────────────────────────────────

function CreateDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: ResearchCreateInput) => void
  isSubmitting: boolean
}) {
  const [title, setTitle] = useState("")
  const [status, setStatus] = useState<ResearchStatus>("WNS")
  const [firstAuthor, setFirstAuthor] = useState("")
  const [corresponding, setCorresponding] = useState("")
  const [targetJournal, setTargetJournal] = useState("")
  const [startDate, setStartDate] = useState("")
  const [publishDate, setPublishDate] = useState("")

  function reset() {
    setTitle("")
    setStatus("WNS")
    setFirstAuthor("")
    setCorresponding("")
    setTargetJournal("")
    setStartDate("")
    setPublishDate("")
  }

  function handleSubmit() {
    if (!title.trim()) return
    const parseList = (s: string) =>
      s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)

    onSubmit({
      title: title.trim(),
      status,
      firstAuthor: parseList(firstAuthor),
      corresponding: parseList(corresponding),
      targetJournal,
      startDate: startDate || null,
      publishDate: publishDate || null,
    })
    reset()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent className="bg-card border-border text-foreground sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <BookOpen className="size-4 text-indigo-400" />
            새 연구 프로젝트
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Title */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">제목 *</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="연구/논문 제목"
              className="bg-muted border-border text-foreground"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Status */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">상태</label>
              <Select value={status} onValueChange={(v) => setStatus(v as ResearchStatus)}>
                <SelectTrigger className="w-full bg-muted border-border text-foreground text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-muted border-border">
                  {RESEARCH_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="text-foreground">
                      <span className="flex items-center gap-2">
                        <span className={`size-2 rounded-full ${STATUS_DOT[s].dot}`} />
                        {STATUS_LABELS[s]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Target Journal */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Target Journal</label>
              <Select value={targetJournal || "__none"} onValueChange={(v) => setTargetJournal(v === "__none" ? "" : v)}>
                <SelectTrigger className="w-full bg-muted border-border text-foreground text-sm">
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent className="bg-muted border-border">
                  <SelectItem value="__none" className="text-muted-foreground">미정</SelectItem>
                  {KNOWN_JOURNALS.map((j) => (
                    <SelectItem key={j} value={j} className="text-foreground">
                      {j}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Authors */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">1st Author</label>
              <Input
                value={firstAuthor}
                onChange={(e) => setFirstAuthor(e.target.value)}
                placeholder="쉼표 구분"
                className="bg-muted border-border text-foreground text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Corresponding</label>
              <Input
                value={corresponding}
                onChange={(e) => setCorresponding(e.target.value)}
                placeholder="쉼표 구분"
                className="bg-muted border-border text-foreground text-sm"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">시작일</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="num bg-muted border-border text-foreground text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">출판일</label>
              <Input
                type="date"
                value={publishDate}
                onChange={(e) => setPublishDate(e.target.value)}
                className="num bg-muted border-border text-foreground text-sm"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="border-border text-foreground/90"
          >
            취소
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!title.trim() || isSubmitting}
            className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5"
          >
            <Plus className="size-3.5" />
            {isSubmitting ? "생성 중..." : "생성"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Journal Badge ────────────────────────────────────────────

const JOURNAL_COLORS: Record<string, string> = {
  Neurospine: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "JNS": "bg-purple-500/15 text-purple-300 border-purple-500/30",
  TSJ: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  "Sci Rep": "bg-green-500/15 text-green-300 border-green-500/30",
  Spine: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  ESJ: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  GSJ: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  "World Neurosurgery": "bg-orange-500/15 text-orange-300 border-orange-500/30",
  JKNS: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  BMC: "bg-pink-500/15 text-pink-300 border-pink-500/30",
}

function JournalBadge({ journal }: { journal: string }) {
  let classes = "bg-zinc-500/15 text-muted-foreground border-zinc-500/30"
  for (const [key, cls] of Object.entries(JOURNAL_COLORS)) {
    if (journal.includes(key)) {
      classes = cls
      break
    }
  }
  return (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0 font-medium ${classes}`}
    >
      {journal}
    </Badge>
  )
}

// ── Helpers ──────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  return `${y}.${m}`
}

function getProjectWarning(project: ResearchProject): string | null {
  if (!project.start_date) return null
  const startDate = new Date(project.start_date)
  const now = new Date()
  const diffYears = (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365)

  if (project.status !== "Published" && project.status !== "Hold") {
    if (diffYears >= 3) return `${Math.floor(diffYears)}년 지연`
    if (diffYears >= 2) return `${Math.floor(diffYears)}년 경과`
  }
  return null
}

function mapUpdatesToProject(
  updates: ResearchUpdateInput
): Partial<ResearchProject> {
  const out: Partial<ResearchProject> = {}
  if (updates.title !== undefined) out.title = updates.title
  if (updates.status !== undefined) out.status = updates.status
  if (updates.firstAuthor !== undefined) out.first_author = updates.firstAuthor
  if (updates.corresponding !== undefined) out.corresponding = updates.corresponding
  if (updates.targetJournal !== undefined) out.target_journal = updates.targetJournal
  if (updates.startDate !== undefined) out.start_date = updates.startDate
  if (updates.publishDate !== undefined) out.publish_date = updates.publishDate
  return out
}

// ── Skeleton ─────────────────────────────────────────────────

function PipelineSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-36 bg-muted" />
        <Skeleton className="h-8 w-20 bg-muted" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card/50 p-3">
            <Skeleton className="h-5 w-20 mb-3 bg-muted" />
            <div className="space-y-2">
              <Skeleton className="h-16 w-full bg-muted rounded-lg" />
              <Skeleton className="h-16 w-full bg-muted rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
