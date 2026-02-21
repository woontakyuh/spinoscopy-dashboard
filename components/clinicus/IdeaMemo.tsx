"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { MemoCategory, MemoDraft } from "@/lib/types/draft"

const CATEGORY_LABEL: Record<MemoCategory, string> = {
  patient: "환자",
  research: "연구",
  idea: "아이디어",
}

const CATEGORY_STYLE: Record<MemoCategory, string> = {
  patient: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  research: "bg-violet-500/20 text-violet-300 border-violet-500/40",
  idea: "bg-amber-500/20 text-amber-300 border-amber-500/40",
}

function formatCreatedAt(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function sanitizeTitle(raw: string) {
  const cleaned = raw.replace(/[#|\^\[\]]/g, "").replace(/[<>:"/\\|?*]/g, "").replace(/^\.+/, "").trim()
  if (!cleaned) return "Untitled"
  return cleaned.slice(0, 120)
}

function obsidianUri(title: string, markdown: string) {
  const safeTitle = sanitizeTitle(title)
  return `obsidian://new?vault=${encodeURIComponent("TakBrain")}&name=${encodeURIComponent(safeTitle)}&content=${encodeURIComponent(markdown)}`
}

export function IdeaMemo() {
  const queryClient = useQueryClient()
  const [rawInput, setRawInput] = useState("")
  const [category, setCategory] = useState<MemoCategory>("patient")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MemoDraft | null>(null)

  const draftsQuery = useQuery({
    queryKey: ["memo-drafts"],
    queryFn: async () => {
      const res = await fetch("/api/notion/drafts")
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "초안 조회 실패" }))
        throw new Error(body.error ?? "초안 조회 실패")
      }
      return res.json() as Promise<MemoDraft[]>
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/notion/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput, category }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "메모 저장 실패" }))
        throw new Error(body.error ?? "메모 저장 실패")
      }
      return res.json() as Promise<MemoDraft>
    },
    onSuccess: (created) => {
      setRawInput("")
      setExpandedId(created.id)
      queryClient.invalidateQueries({ queryKey: ["memo-drafts"] })
    },
  })

  const actionMutation = useMutation({
    mutationFn: async (params: { pageId: string; action: "confirm" | "delete" }) => {
      const res = await fetch("/api/notion/drafts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "작업 실패" }))
        throw new Error(body.error ?? "작업 실패")
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memo-drafts"] })
    },
  })

  const isBusy = createMutation.isPending || actionMutation.isPending

  const drafts = useMemo(() => draftsQuery.data ?? [], [draftsQuery.data])

  function handleSave() {
    if (!rawInput.trim()) return
    createMutation.mutate()
  }

  async function handleOpenObsidian(draft: MemoDraft) {
    const uri = obsidianUri(draft.title, draft.markdown)
    window.open(uri, "_self")
    await actionMutation.mutateAsync({ pageId: draft.id, action: "confirm" })
    if (expandedId === draft.id) {
      setExpandedId(null)
    }
  }

  function handleDelete() {
    if (!deleteTarget) return
    actionMutation.mutate(
      { pageId: deleteTarget.id, action: "delete" },
      { onSettled: () => setDeleteTarget(null) }
    )
  }

  return (
    <div className="space-y-4">
      <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900 space-y-3">
        <p className="text-zinc-300 text-sm font-medium">아이디어 메모</p>

        <div className="flex gap-2 flex-wrap">
          {(["patient", "research", "idea"] as MemoCategory[]).map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => setCategory(item)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                category === item
                  ? "bg-amber-600 border-amber-500 text-white"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {CATEGORY_LABEL[item]}
            </button>
          ))}
        </div>

        <textarea
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          placeholder="떠오르는 생각을 자유롭게 적어주세요..."
          className="w-full min-h-32 rounded-lg border border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500 p-3 text-sm outline-none focus:ring-2 focus:ring-amber-500"
        />

        {createMutation.isError && (
          <p className="text-red-400 text-sm">오류: {createMutation.error.message}</p>
        )}

        <Button
          type="button"
          onClick={handleSave}
          disabled={isBusy || !rawInput.trim()}
          className="w-full bg-amber-600 hover:bg-amber-500 text-white"
        >
          {createMutation.isPending ? "정리 중..." : "메모 저장"}
        </Button>
      </div>

      <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-zinc-300 text-sm font-medium">저장된 Draft</p>
          <span className="text-zinc-500 text-xs">{drafts.length}개</span>
        </div>

        {draftsQuery.isLoading ? (
          <p className="text-zinc-500 text-sm">불러오는 중...</p>
        ) : draftsQuery.isError ? (
          <p className="text-red-400 text-sm">오류: {(draftsQuery.error as Error).message}</p>
        ) : drafts.length === 0 ? (
          <p className="text-zinc-500 text-sm">저장된 draft가 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {drafts.map((draft) => {
              const expanded = expandedId === draft.id
              return (
                <div key={draft.id} className="border border-zinc-700 rounded-lg bg-zinc-800/50">
                  <div className="p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-white text-sm font-medium">{draft.title}</p>
                      <Badge variant="outline" className={CATEGORY_STYLE[draft.category]}>
                        {CATEGORY_LABEL[draft.category]}
                      </Badge>
                      <span className="text-zinc-500 text-xs">{formatCreatedAt(draft.createdAt)}</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-zinc-600 text-zinc-200 hover:bg-zinc-700"
                        onClick={() => setExpandedId(expanded ? null : draft.id)}
                      >
                        {expanded ? "미리보기 닫기" : "미리보기"}
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-500 text-white"
                        disabled={isBusy}
                        onClick={() => void handleOpenObsidian(draft)}
                      >
                        Obsidian으로 열기
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={isBusy}
                        onClick={() => setDeleteTarget(draft)}
                      >
                        삭제
                      </Button>
                    </div>

                    {expanded && (
                      <pre className="whitespace-pre-wrap break-words text-zinc-200 text-xs bg-zinc-900 border border-zinc-700 rounded-md p-3 max-h-64 overflow-auto">
                        {draft.markdown}
                      </pre>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {actionMutation.isError && (
          <p className="text-red-400 text-sm">오류: {actionMutation.error.message}</p>
        )}
      </div>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-white">
          <DialogHeader>
            <DialogTitle>Draft 삭제</DialogTitle>
            <DialogDescription className="text-zinc-400">
              이 draft를 삭제하면 복구할 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="border-zinc-600" onClick={() => setDeleteTarget(null)}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={actionMutation.isPending}>
              {actionMutation.isPending ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
