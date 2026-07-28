"use client"

import type { TimelineRow } from "@/lib/dakota-ledger/stats"
import { DOMAIN_CHART_COLOR } from "../operationLabels"
import { ChartEmpty, ChartPanel } from "./ChartPanel"

function domainColor(domain: string): string {
  return DOMAIN_CHART_COLOR[domain] ?? DOMAIN_CHART_COLOR.Training
}

/**
 * recharts는 간트 형태를 잘 다루지 못해 순수 div 포지셔닝으로 그린다 —
 * 새 차트 라이브러리를 추가하지 않는다는 제약은 지킨다.
 */
export function TimelineChart({ rows }: { rows: TimelineRow[] }) {
  if (rows.length === 0) {
    return (
      <ChartPanel title="타임라인" subtitle="과제별 착수 ~ 최근 접촉 구간">
        <ChartEmpty message="이 기간에 표시할 과제가 없습니다." />
      </ChartPanel>
    )
  }

  const starts = rows.map((r) => new Date(r.start).getTime())
  const ends = rows.map((r) => new Date(r.end).getTime())
  const min = Math.min(...starts)
  const max = Math.max(...ends, min + 86_400_000)
  const span = max - min

  return (
    <ChartPanel title="타임라인" subtitle="과제별 착수 ~ 최근 접촉 구간, 착수일 순">
      <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
        {rows.map((row) => {
          const startPct = ((new Date(row.start).getTime() - min) / span) * 100
          const endPct = ((new Date(row.end).getTime() - min) / span) * 100
          const widthPct = Math.max(0.6, endPct - startPct)
          return (
            <div key={row.pageId} className="flex items-center gap-2 text-[11px]">
              <span className="w-32 shrink-0 truncate text-zinc-400 sm:w-40" title={row.name}>
                {row.name}
              </span>
              <div className="relative h-3 flex-1 bg-zinc-900">
                <div
                  className="absolute top-0 h-full"
                  style={{ left: `${startPct}%`, width: `${widthPct}%`, backgroundColor: domainColor(row.domain) }}
                  title={`${row.start.slice(0, 10)} ~ ${row.end.slice(0, 10)}`}
                />
              </div>
            </div>
          )
        })}
      </div>
    </ChartPanel>
  )
}
