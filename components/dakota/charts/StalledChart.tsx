"use client"

import type { StalledRow } from "@/lib/dakota-ledger/stats"
import { DOMAIN_LABEL } from "../operationLabels"
import { ChartEmpty, ChartPanel } from "./ChartPanel"

const TOP_N = 8

function tone(days: number | null): string {
  if (days === null) return "#52525b" // zinc-600, neutral
  if (days > 30) return "#d03b3b" // status critical
  if (days > 14) return "#fab219" // status warning
  return "#3987e5" // categorical slot 1, default
}

export function StalledChart({ rows }: { rows: StalledRow[] }) {
  const top = rows.filter((r) => r.stalledDays !== null).slice(0, TOP_N)
  const max = top.reduce((m, r) => Math.max(m, r.stalledDays ?? 0), 0) || 1

  return (
    <ChartPanel title="정체" subtitle="완료/보관을 뺀 과제 중 최근 접촉 이후 오래된 순">
      {top.length === 0 ? (
        <ChartEmpty message="정체된 과제가 없습니다." />
      ) : (
        <ul className="space-y-3">
          {top.map((row) => (
            <li key={row.pageId}>
              <div className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="truncate text-zinc-300" title={row.name}>
                  {DOMAIN_LABEL[row.domain] ?? row.domain} · {row.name}
                </span>
                <span className="shrink-0 tabular-nums" style={{ color: tone(row.stalledDays) }}>
                  {row.stalledDays}일
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full bg-zinc-900">
                <div
                  className="h-full"
                  style={{ width: `${Math.max(4, ((row.stalledDays ?? 0) / max) * 100)}%`, backgroundColor: tone(row.stalledDays) }}
                />
              </div>
              {row.nextAction && <p className="mt-1 truncate text-[10px] text-zinc-600" title={row.nextAction}>다음: {row.nextAction}</p>}
            </li>
          ))}
        </ul>
      )}
    </ChartPanel>
  )
}
