"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowUpRight, ChevronRight, Loader2, X } from "lucide-react"
import type { OperationItem } from "@/lib/notion/operations"

const LANES = [
  { id: "In Progress", label: "지금 진행", description: "Dakota가 움직이고 있는 일", tone: "border-sky-400/35 bg-sky-500/[0.035]" },
  { id: "Waiting", label: "센터장님 결정", description: "승인·선택·외부 회신이 필요한 일", tone: "border-amber-400/35 bg-amber-500/[0.035]" },
  { id: "Inbox", label: "반복 운영", description: "계속 굴러가고 있는 routine", tone: "border-violet-400/35 bg-violet-500/[0.035]" },
  { id: "Completed", label: "최근 마침", description: "이번 달 닫힌 주요 일", tone: "border-emerald-400/35 bg-emerald-500/[0.035]" },
] as const

type OperationStatus = (typeof LANES)[number]["id"] | "Archived"
type OperationsResponse = { configured: boolean; operations: OperationItem[] }

const DOMAIN_LABEL: Record<string, string> = {
  Strategy: "전략·기회",
  Clinical: "임상",
  Research: "KSOR·연구",
  AI: "AI·시스템",
  Family: "가족",
  Personal: "개인",
  Operations: "운영",
}

const DOMAIN_TONE: Record<string, string> = {
  Strategy: "bg-violet-400/10 text-violet-200",
  Clinical: "bg-orange-400/10 text-orange-200",
  Research: "bg-blue-400/10 text-blue-200",
  AI: "bg-cyan-400/10 text-cyan-200",
  Family: "bg-emerald-400/10 text-emerald-200",
  Personal: "bg-pink-400/10 text-pink-200",
  Operations: "bg-zinc-400/10 text-zinc-300",
}

const DOMAIN_FILTERS = ["All", "Research", "AI", "Operations", "Family", "Personal", "Strategy", "Clinical"] as const

async function fetchOperations(): Promise<OperationsResponse> {
  const response = await fetch("/api/dakota/operations")
  if (!response.ok) throw new Error("운영 기록을 불러오지 못했습니다.")
  return response.json()
}

async function updateStatus(pageId: string, status: OperationStatus): Promise<void> {
  const response = await fetch("/api/dakota/operations", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page_id: pageId, status }),
  })
  if (!response.ok) throw new Error("상태 변경에 실패했습니다.")
}

function DetailLine({ label, value, tone = "text-zinc-300" }: { label: string; value: string; tone?: string }) {
  if (!value) return null
  return (
    <section>
      <p className="mb-1.5 text-[11px] font-medium tracking-wide text-zinc-500">{label}</p>
      <p className={`whitespace-pre-wrap text-sm leading-6 ${tone}`}>{value}</p>
    </section>
  )
}

function OperationDetail({ item, close }: { item: OperationItem; close: () => void }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (status: OperationStatus) => updateStatus(item.page_id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dakota-operations"] }),
  })

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/55 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={`${item.name} 상세`}>
      <button className="absolute inset-0 cursor-default" onClick={close} aria-label="상세 닫기" />
      <aside className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-zinc-700 bg-zinc-950 p-5 shadow-2xl sm:rounded-2xl sm:border">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${DOMAIN_TONE[item.domain] ?? DOMAIN_TONE.Operations}`}>
              {DOMAIN_LABEL[item.domain] ?? item.domain}
            </span>
            <h2 className="mt-3 text-xl font-semibold leading-snug text-white">{item.name}</h2>
            <p className="mt-2 text-xs text-zinc-500">마지막 업데이트 {item.updated_at}</p>
          </div>
          <button onClick={close} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white" aria-label="닫기"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-7 space-y-6">
          <DetailLine label="무슨 일인가" value={item.context} />
          <DetailLine label="Dakota가 한 일" value={item.action_taken} tone="text-sky-100" />
          <DetailLine label="현재 결과" value={item.result} tone="text-emerald-100" />
          <DetailLine label="다음 행동" value={item.next_action} tone="text-amber-100" />
        </div>

        <div className="mt-auto border-t border-zinc-800 pt-5">
          <p className="mb-2 text-[11px] font-medium tracking-wide text-zinc-500">상태</p>
          <div className="flex flex-wrap gap-2">
            {LANES.map((lane) => (
              <button
                key={lane.id}
                onClick={() => mutation.mutate(lane.id)}
                disabled={mutation.isPending || item.status === lane.id}
                className={`rounded-lg border px-3 py-2 text-xs transition-colors ${item.status === lane.id ? "border-white/70 bg-white text-zinc-950" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}
              >
                {lane.label}
              </button>
            ))}
          </div>
          <a href={item.notion_url} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white">
            Notion에서 열기 <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </aside>
    </div>
  )
}

function OperationCard({ item, open }: { item: OperationItem; open: () => void }) {
  const preview = item.result || item.action_taken || item.next_action || item.context
  return (
    <button onClick={open} className="group w-full rounded-xl border border-zinc-800 bg-zinc-950/75 p-3.5 text-left transition hover:border-zinc-600 hover:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${DOMAIN_TONE[item.domain] ?? DOMAIN_TONE.Operations}`}>
          {DOMAIN_LABEL[item.domain] ?? item.domain}
        </span>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-zinc-300" />
      </div>
      <h3 className="mt-3 text-sm font-semibold leading-5 text-zinc-100">{item.name}</h3>
      {preview && <p className="mt-2 line-clamp-3 text-xs leading-5 text-zinc-400">{preview}</p>}
      <p className="mt-3 text-[10px] text-zinc-600">{item.updated_at}</p>
    </button>
  )
}

export function OperationsLedger() {
  const [domain, setDomain] = useState<(typeof DOMAIN_FILTERS)[number]>("All")
  const [selected, setSelected] = useState<OperationItem | null>(null)
  const { data, isLoading, error } = useQuery({
    queryKey: ["dakota-operations"],
    queryFn: fetchOperations,
    refetchInterval: 60_000,
  })

  const visible = useMemo(() => (data?.operations ?? []).filter((item) => domain === "All" || item.domain === domain), [data?.operations, domain])
  const byStatus = useMemo(() => {
    const groups = new Map<string, OperationItem[]>()
    LANES.forEach((lane) => groups.set(lane.id, []))
    visible.forEach((item) => groups.get(item.status)?.push(item))
    return groups
  }, [visible])

  if (isLoading) return <div className="flex h-48 items-center justify-center text-sm text-zinc-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" />기록을 여는 중입니다.</div>
  if (error) return <p className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-200">{error.message}</p>
  if (!data?.configured) return <p className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 text-sm text-zinc-400">운영 기록 DB 연결이 필요합니다.</p>

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 border-b border-zinc-800 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.18em] text-zinc-500">DAKOTA · OPERATING REVIEW</p>
          <h1 className="mt-1 text-xl font-semibold text-white">이번 달, 우리가 실제로 한 일</h1>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DOMAIN_FILTERS.map((filter) => (
            <button key={filter} onClick={() => setDomain(filter)} className={`rounded-md px-2.5 py-1.5 text-xs transition ${domain === filter ? "bg-white text-zinc-950" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"}`}>
              {filter === "All" ? "전체" : DOMAIN_LABEL[filter] ?? filter}
            </button>
          ))}
        </div>
      </header>

      <section className="overflow-x-auto pb-2">
        <div className="grid min-w-[1040px] grid-cols-4 gap-3">
          {LANES.map((lane) => {
            const items = byStatus.get(lane.id) ?? []
            return (
              <section key={lane.id} className={`rounded-2xl border p-3 ${lane.tone}`}>
                <div className="mb-3 border-b border-white/5 px-1 pb-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-zinc-100">{lane.label}</h2>
                    <span className="rounded-full bg-zinc-950/70 px-2 py-0.5 text-xs text-zinc-400">{items.length}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500">{lane.description}</p>
                </div>
                <div className="space-y-2.5">
                  {items.length === 0 ? <p className="px-1 py-5 text-xs text-zinc-600">없음</p> : items.map((item) => <OperationCard key={item.page_id} item={item} open={() => setSelected(item)} />)}
                </div>
              </section>
            )
          })}
        </div>
      </section>

      {selected && <OperationDetail item={selected} close={() => setSelected(null)} />}
    </div>
  )
}
