"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, CircleDot, ExternalLink, Loader2, Plus, ShieldCheck } from "lucide-react"
import type { OperationItem } from "@/lib/notion/operations"

const BOARD_COLUMNS = [
  { id: "Inbox", label: "정리 전", tone: "border-zinc-700 bg-zinc-900/45" },
  { id: "In Progress", label: "진행 중", tone: "border-blue-500/40 bg-blue-500/5" },
  { id: "Waiting", label: "대기 · 확인", tone: "border-amber-500/40 bg-amber-500/5" },
  { id: "Completed", label: "완료", tone: "border-emerald-500/35 bg-emerald-500/5" },
] as const

type OperationStatus = (typeof BOARD_COLUMNS)[number]["id"] | "Archived"

type OperationsResponse = { configured: boolean; operations: OperationItem[] }

const domainTone: Record<string, string> = {
  Strategy: "text-violet-300 border-violet-400/30",
  Clinical: "text-orange-300 border-orange-400/30",
  Research: "text-indigo-300 border-indigo-400/30",
  AI: "text-cyan-300 border-cyan-400/30",
  Family: "text-emerald-300 border-emerald-400/30",
  Personal: "text-pink-300 border-pink-400/30",
  Operations: "text-zinc-300 border-zinc-500/30",
}

async function fetchOperations(): Promise<OperationsResponse> {
  const response = await fetch("/api/dakota/operations")
  if (!response.ok) throw new Error("운영 기록을 불러오지 못했습니다.")
  return response.json()
}

async function updateOperation(pageId: string, status: OperationStatus): Promise<void> {
  const response = await fetch("/api/dakota/operations", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page_id: pageId, status }),
  })
  if (!response.ok) throw new Error("상태 변경에 실패했습니다.")
}

async function createOperation(name: string): Promise<void> {
  const response = await fetch("/api/dakota/operations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, status: "Inbox", type: "Execution", domain: "Operations" }),
  })
  if (!response.ok) throw new Error("운영 항목 생성에 실패했습니다.")
}

function OperationCard({ item }: { item: OperationItem }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (status: OperationStatus) => updateOperation(item.page_id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dakota-operations"] }),
  })

  return (
    <article className="rounded-xl border border-border/90 bg-card/80 p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={`rounded-full border px-1.5 py-0.5 ${domainTone[item.domain] ?? domainTone.Operations}`}>{item.domain}</span>
            <span>{item.type}</span>
            {item.priority === "High" && <span className="text-red-300">High</span>}
          </div>
          <h3 className="mt-2 text-sm font-semibold leading-snug text-foreground">{item.name}</h3>
        </div>
        <a href={item.notion_url} target="_blank" rel="noreferrer" className="mt-0.5 text-muted-foreground hover:text-foreground" aria-label="Notion에서 열기">
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {item.action_taken && (
        <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground/75">수행 </span>{item.action_taken}
        </p>
      )}
      {item.result && (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-emerald-200/80">
          <span className="font-medium">결과 </span>{item.result}
        </p>
      )}
      {item.next_action && item.status !== "Completed" && (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-blue-200/80">
          <span className="font-medium">다음 </span>{item.next_action}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
        <span className="text-[10px] text-muted-foreground">업데이트 {item.updated_at}</span>
        <select
          value={item.status}
          onChange={(event) => mutation.mutate(event.target.value as OperationStatus)}
          disabled={mutation.isPending}
          className="rounded-md border border-border bg-muted px-1.5 py-1 text-[11px] text-foreground outline-none focus:border-blue-500 disabled:opacity-50"
          aria-label={`${item.name} 상태`}
        >
          {BOARD_COLUMNS.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}
          <option value="Archived">보관</option>
        </select>
      </div>
    </article>
  )
}

function SetupState() {
  return (
    <section className="rounded-2xl border border-dashed border-blue-400/40 bg-blue-500/5 p-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />
        <div>
          <h2 className="font-semibold text-foreground">Dakota Operations DB 연결이 필요합니다</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            이 보드는 원문 대화를 복제하지 않습니다. Dakota가 정리한 결정·수행·결과·다음 행동만 Notion에 남기고, Dashboard는 그 기록을 읽습니다.
          </p>
          <div className="mt-4 rounded-lg bg-background/70 p-3 font-mono text-xs leading-6 text-muted-foreground">
            NOTION_DAKOTA_OPERATIONS_DB_ID<br />
            Name · Status · Type · Domain · Context · Action Taken · Result · Next Action · Visibility
          </div>
        </div>
      </div>
    </section>
  )
}

export function OperationsLedger() {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState("")
  const { data, isLoading, error } = useQuery({
    queryKey: ["dakota-operations"],
    queryFn: fetchOperations,
    refetchInterval: 60_000,
  })
  const createMutation = useMutation({
    mutationFn: () => createOperation(draft.trim()),
    onSuccess: () => {
      setDraft("")
      queryClient.invalidateQueries({ queryKey: ["dakota-operations"] })
    },
  })

  const operations = data?.operations
  const byStatus = useMemo(() => {
    const groups = new Map<string, OperationItem[]>()
    BOARD_COLUMNS.forEach((column) => groups.set(column.id, []))
    ;(operations ?? []).filter((item) => item.status !== "Archived").forEach((item) => groups.get(item.status)?.push(item))
    return groups
  }, [operations])

  if (isLoading) {
    return <div className="flex h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />운영 기록을 불러오는 중입니다.</div>
  }
  if (error) {
    return <p className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-200">{error.message}</p>
  }
  if (!data?.configured) return <SetupState />

  const completed = (operations ?? []).filter((item) => item.status === "Completed").slice(0, 8)

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card/60 p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-blue-300">Dakota Operations Ledger</p>
            <h2 className="mt-1 text-lg font-semibold">대화는 편하게, 실행은 흔적이 남게</h2>
            <p className="mt-1 text-sm text-muted-foreground">원문 대신 결정·수행·결과·다음 행동을 정리합니다. Todo는 계속 Notion To-Do List가 기준입니다.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CircleDot className="h-4 w-4 text-blue-300" />
            진행 {byStatus.get("In Progress")?.length ?? 0}건
            <Check className="ml-2 h-4 w-4 text-emerald-300" />
            완료 {completed.length}건
          </div>
        </div>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (draft.trim()) createMutation.mutate()
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="새 운영 항목 — 예: KSOR registry data dictionary 확정"
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <button type="submit" disabled={!draft.trim() || createMutation.isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
            <Plus className="h-4 w-4" />추가
          </button>
        </form>
      </section>

      <section className="overflow-x-auto pb-2">
        <div className="grid min-w-[960px] grid-cols-4 gap-3">
          {BOARD_COLUMNS.map((column) => {
            const items = byStatus.get(column.id) ?? []
            return (
              <div key={column.id} className={`rounded-2xl border p-3 ${column.tone}`}>
                <div className="mb-3 flex items-center justify-between px-1">
                  <h3 className="text-sm font-semibold">{column.label}</h3>
                  <span className="rounded-full bg-background/70 px-2 py-0.5 text-xs text-muted-foreground">{items.length}</span>
                </div>
                <div className="space-y-3">
                  {items.length === 0 ? <p className="rounded-xl border border-dashed border-border/70 p-3 text-xs text-muted-foreground">항목 없음</p> : items.map((item) => <OperationCard key={item.page_id} item={item} />)}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card/60 p-4 md:p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-300">Recent outcomes</p>
            <h2 className="mt-1 text-base font-semibold">최근 완료·결정 로그</h2>
          </div>
          <span className="text-xs text-muted-foreground">최근 업데이트순</span>
        </div>
        <div className="mt-4 divide-y divide-border">
          {completed.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">아직 완료된 운영 기록이 없습니다.</p>
          ) : completed.map((item) => (
            <div key={item.page_id} className="grid gap-2 py-3 md:grid-cols-[132px_1fr]">
              <div className="text-xs text-muted-foreground">{item.completed_at ?? item.updated_at} · {item.domain}</div>
              <div>
                <div className="flex items-center gap-2"><p className="text-sm font-medium">{item.name}</p><a href={item.notion_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /></a></div>
                {item.result && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.result}</p>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
