"use client"

import { useState, useCallback } from "react"
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
  ChevronUp,
  Calendar,
  BookOpen,
  Users,
  FileText,
} from "lucide-react"
import type {
  ResearchProject,
  ResearchStatus,
  ResearchCreateInput,
  ResearchUpdateInput,
} from "@/lib/types/research"
import { RESEARCH_STATUSES, STATUS_LABELS } from "@/lib/types/research"

// ── Status Column Config ─────────────────────────────────────

interface StatusConfig {
  label: string
  color: string
  bg: string
  border: string
  dot: string
  headerBg: string
}

const STATUS_CONFIG: Record<ResearchStatus, StatusConfig> = {
  WNS: {
    label: "WNS",
    color: "text-zinc-300",
    bg: "bg-zinc-800/50",
    border: "border-zinc-700/50",
    dot: "bg-zinc-400",
    headerBg: "bg-zinc-800",
  },
  "Manuscript drafting": {
    label: "Drafting",
    color: "text-indigo-300",
    bg: "bg-indigo-950/30",
    border: "border-indigo-800/40",
    dot: "bg-indigo-400",
    headerBg: "bg-indigo-900/40",
  },
  Editing: {
    label: "Editing",
    color: "text-amber-300",
    bg: "bg-amber-950/30",
    border: "border-amber-800/40",
    dot: "bg-amber-400",
    headerBg: "bg-amber-900/40",
  },
  Submitted: {
    label: "Submitted",
    color: "text-cyan-300",
    bg: "bg-cyan-950/30",
    border: "border-cyan-800/40",
    dot: "bg-cyan-400",
    headerBg: "bg-cyan-900/40",
  },
  Published: {
    label: "Published",
    color: "text-emerald-300",
    bg: "bg-emerald-950/30",
    border: "border-emerald-800/40",
    dot: "bg-emerald-400",
    headerBg: "bg-emerald-900/40",
  },
  Hold: {
    label: "Hold",
    color: "text-zinc-400",
    bg: "bg-zinc-900/50",
    border: "border-zinc-700/30",
    dot: "bg-zinc-500",
    headerBg: "bg-zinc-800/60",
  },
}

// Pipeline display order (Hold at end, separate)
const PIPELINE_STATUSES: ResearchStatus[] = [
  "WNS",
  "Manuscript drafting",
  "Editing",
  "Submitted",
  "Published",
  "Hold",
]

// Known options for select fields
const KNOWN_AUTHORS = [
  "여운탁", "김준회", "김태신", "안경득", "정천기", "최일",
  "박성민", "이승환", "조규정", "김세훈", "이재협",
]

const KNOWN_JOURNALS = [
  "Neurospine", "JNS spine", "TSJ", "Sci Rep", "Spine",
  "ESJ", "GSJ", "World Neurosurgery", "JKNS", "BMC",
]

// ── Main Component ───────────────────────────────────────────

export function ResearchPipeline() {
  const queryClient = useQueryClient()
  const [selectedProject, setSelectedProject] = useState<ResearchProject | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [mobileExpanded, setMobileExpanded] = useState<ResearchStatus | null>(null)

  const { data: projects, isLoading, isError } = useQuery<ResearchProject[]>({
    queryKey: ["research-projects"],
    queryFn: async () => {
      const res = await fetch("/api/notion/research")
      if (!res.ok) throw new Error("Failed to fetch research projects")
      return res.json()
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

  const createMutation = useMutation({
    mutationFn: async (input: ResearchCreateInput) => {
      const res = await fetch("/api/notion/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error("Failed to create project")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["research-projects"] })
      setShowCreateDialog(false)
    },
  })

  const projectsByStatus = useCallback(
    (status: ResearchStatus) =>
      (projects ?? []).filter((p) => p.status === status),
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
          <h2 className="text-lg font-semibold text-white">연구 파이프라인</h2>
          <Badge variant="secondary" className="bg-zinc-800 text-zinc-300 border border-zinc-700">
            {totalCount}건
          </Badge>
        </div>
        <Button
          size="sm"
          onClick={() => setShowCreateDialog(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5"
        >
          <Plus className="size-4" />
          새 연구
        </Button>
      </div>

      {/* Kanban Board */}
      <div className="overflow-x-auto scrollbar-hide -mx-3 px-3 md:mx-0 md:px-0">
        <div className="flex gap-3 min-w-[1100px] md:min-w-0 md:grid md:grid-cols-6">
          {PIPELINE_STATUSES.map((status) => {
            const config = STATUS_CONFIG[status]
            const items = projectsByStatus(status)
            const isExpanded = mobileExpanded === status

            return (
              <div
                key={status}
                className={`flex flex-col rounded-xl border ${config.border} ${config.bg} min-w-[200px] md:min-w-0`}
              >
                {/* Column Header */}
                <button
                  onClick={() =>
                    setMobileExpanded(isExpanded ? null : status)
                  }
                  className={`flex items-center justify-between px-3 py-2.5 rounded-t-xl ${config.headerBg} md:cursor-default`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`size-2 rounded-full ${config.dot}`}
                    />
                    <span
                      className={`text-sm font-semibold ${config.color}`}
                    >
                      {config.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-zinc-500 font-medium bg-zinc-900/60 px-1.5 py-0.5 rounded-full">
                      {items.length}
                    </span>
                    <ChevronDown
                      className={`size-4 text-zinc-500 md:hidden transition-transform ${
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
                  {items.length === 0 ? (
                    <div className="text-xs text-zinc-600 text-center py-4">
                      항목 없음
                    </div>
                  ) : (
                    items.map((project) => (
                      <ProjectCard
                        key={project.page_id}
                        project={project}
                        config={config}
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
                    ))
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

      {/* Create Dialog */}
      <CreateDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={(input) => createMutation.mutate(input)}
        isSubmitting={createMutation.isPending}
      />
    </div>
  )
}

// ── Project Card ─────────────────────────────────────────────

function ProjectCard({
  project,
  config,
  isSelected,
  onClick,
}: {
  project: ResearchProject
  config: StatusConfig
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`card-hover text-left w-full rounded-lg border p-2.5 transition-all duration-200 ${
        isSelected
          ? "border-indigo-500/60 bg-indigo-950/30 ring-1 ring-indigo-500/30"
          : "border-zinc-700/40 bg-zinc-900/60 hover:border-zinc-600/60 hover:bg-zinc-800/60"
      }`}
    >
      {/* Title */}
      <p className="text-sm font-medium text-zinc-100 line-clamp-2 leading-snug mb-2">
        {project.title}
      </p>

      {/* Target Journal */}
      {project.target_journal && (
        <div className="mb-2">
          <JournalBadge journal={project.target_journal} />
        </div>
      )}

      {/* Footer: author + date */}
      <div className="flex items-center justify-between gap-1">
        {project.first_author.length > 0 ? (
          <span className="text-[11px] text-zinc-400 truncate max-w-[110px]">
            <Users className="size-3 inline mr-0.5 -mt-px" />
            {project.first_author[0]}
            {project.first_author.length > 1 && ` +${project.first_author.length - 1}`}
          </span>
        ) : (
          <span />
        )}
        {project.start_date && (
          <span className="num text-[10px] text-zinc-500 whitespace-nowrap">
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
    <div className="animate-fade-in-up rounded-xl border border-zinc-700/60 bg-zinc-900/80 backdrop-blur-sm p-4 md:p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-indigo-400" />
          <span className="text-sm font-semibold text-zinc-200">프로젝트 상세</span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-400 hover:text-indigo-400 transition-colors flex items-center gap-1"
          >
            <ExternalLink className="size-3" />
            Notion
          </a>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Form Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        {/* Title - full width */}
        <div className="md:col-span-2">
          <label className="text-xs text-zinc-400 mb-1 block">제목</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-zinc-800/80 border-zinc-700 text-white text-sm"
          />
        </div>

        {/* Status */}
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">상태</label>
          <Select value={status} onValueChange={(v) => setStatus(v as ResearchStatus)}>
            <SelectTrigger className="w-full bg-zinc-800/80 border-zinc-700 text-white text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700">
              {RESEARCH_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="text-zinc-200">
                  <span className="flex items-center gap-2">
                    <span className={`size-2 rounded-full ${STATUS_CONFIG[s].dot}`} />
                    {STATUS_LABELS[s]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Target Journal */}
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Target Journal</label>
          <Select value={targetJournal || "__none"} onValueChange={(v) => setTargetJournal(v === "__none" ? "" : v)}>
            <SelectTrigger className="w-full bg-zinc-800/80 border-zinc-700 text-white text-sm">
              <SelectValue placeholder="선택" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700">
              <SelectItem value="__none" className="text-zinc-500">미정</SelectItem>
              {KNOWN_JOURNALS.map((j) => (
                <SelectItem key={j} value={j} className="text-zinc-200">
                  {j}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 1st Author */}
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">1st Author (쉼표 구분)</label>
          <Input
            value={firstAuthor}
            onChange={(e) => setFirstAuthor(e.target.value)}
            placeholder="예: 김준회, 여운탁"
            className="bg-zinc-800/80 border-zinc-700 text-white text-sm"
          />
        </div>

        {/* Corresponding */}
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Corresponding (쉼표 구분)</label>
          <Input
            value={corresponding}
            onChange={(e) => setCorresponding(e.target.value)}
            placeholder="예: 여운탁"
            className="bg-zinc-800/80 border-zinc-700 text-white text-sm"
          />
        </div>

        {/* Start Date */}
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">시작일</label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="num bg-zinc-800/80 border-zinc-700 text-white text-sm"
          />
        </div>

        {/* Publish Date */}
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">출판일</label>
          <Input
            type="date"
            value={publishDate}
            onChange={(e) => setPublishDate(e.target.value)}
            className="num bg-zinc-800/80 border-zinc-700 text-white text-sm"
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
      <DialogContent className="bg-zinc-900 border-zinc-700 text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <BookOpen className="size-4 text-indigo-400" />
            새 연구 프로젝트
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Title */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">제목 *</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="연구/논문 제목"
              className="bg-zinc-800 border-zinc-700 text-white"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Status */}
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">상태</label>
              <Select value={status} onValueChange={(v) => setStatus(v as ResearchStatus)}>
                <SelectTrigger className="w-full bg-zinc-800 border-zinc-700 text-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {RESEARCH_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="text-zinc-200">
                      <span className="flex items-center gap-2">
                        <span className={`size-2 rounded-full ${STATUS_CONFIG[s].dot}`} />
                        {STATUS_LABELS[s]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Target Journal */}
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Target Journal</label>
              <Select value={targetJournal || "__none"} onValueChange={(v) => setTargetJournal(v === "__none" ? "" : v)}>
                <SelectTrigger className="w-full bg-zinc-800 border-zinc-700 text-white text-sm">
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="__none" className="text-zinc-500">미정</SelectItem>
                  {KNOWN_JOURNALS.map((j) => (
                    <SelectItem key={j} value={j} className="text-zinc-200">
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
              <label className="text-xs text-zinc-400 mb-1 block">1st Author</label>
              <Input
                value={firstAuthor}
                onChange={(e) => setFirstAuthor(e.target.value)}
                placeholder="쉼표 구분"
                className="bg-zinc-800 border-zinc-700 text-white text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Corresponding</label>
              <Input
                value={corresponding}
                onChange={(e) => setCorresponding(e.target.value)}
                placeholder="쉼표 구분"
                className="bg-zinc-800 border-zinc-700 text-white text-sm"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">시작일</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="num bg-zinc-800 border-zinc-700 text-white text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">출판일</label>
              <Input
                type="date"
                value={publishDate}
                onChange={(e) => setPublishDate(e.target.value)}
                className="num bg-zinc-800 border-zinc-700 text-white text-sm"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="border-zinc-700 text-zinc-300"
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
  let classes = "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
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
        <Skeleton className="h-7 w-36 bg-zinc-800" />
        <Skeleton className="h-8 w-20 bg-zinc-800" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
            <Skeleton className="h-5 w-20 mb-3 bg-zinc-800" />
            <div className="space-y-2">
              <Skeleton className="h-16 w-full bg-zinc-800 rounded-lg" />
              <Skeleton className="h-16 w-full bg-zinc-800 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
