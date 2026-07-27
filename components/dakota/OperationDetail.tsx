"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowUpRight, X } from "lucide-react"
import type { OperationItem } from "@/lib/notion/operations"
import {
  DOMAIN_LABEL,
  DOMAIN_TONE,
  STATUS_LABEL,
  STATUS_ORDER,
  updateOperationStatus,
  type OperationStatus,
} from "./operationLabels"

function DetailLine({ label, value, tone = "text-zinc-300" }: { label: string; value: string; tone?: string }) {
  if (!value) return null
  return (
    <section>
      <p className="mb-1.5 text-[11px] font-medium tracking-wide text-zinc-500">{label}</p>
      <p className={`whitespace-pre-wrap text-sm leading-6 ${tone}`}>{value}</p>
    </section>
  )
}

export function OperationDetail({ item, close }: { item: OperationItem; close: () => void }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (status: OperationStatus) => updateOperationStatus(item.page_id, status),
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
            {STATUS_ORDER.map((status) => (
              <button
                key={status}
                onClick={() => mutation.mutate(status)}
                disabled={mutation.isPending || item.status === status}
                className={`rounded-lg border px-3 py-2 text-xs transition-colors ${item.status === status ? "border-white/70 bg-white text-zinc-950" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}
              >
                {STATUS_LABEL[status] ?? status}
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
