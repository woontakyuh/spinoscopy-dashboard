"use client"

import { useMemo } from "react"
import type { OperationItem } from "@/lib/notion/operations"
import type { SessionLogItem } from "@/lib/notion/sessionLog"
import { getPeriodRange, type PeriodFilter, type PeriodRange } from "@/lib/dakota-ledger/period"
import {
  aggregateTrend,
  bucketGranularityForPeriod,
  buildTimeBuckets,
  buildTimelineRows,
  computeDomainShare,
  computeLeadTimeByDomain,
  computeRhythmMatrix,
  computeStalledRanking,
} from "@/lib/dakota-ledger/stats"
import { DomainShareChart } from "./charts/DomainShareChart"
import { LeadTimeChart } from "./charts/LeadTimeChart"
import { RhythmHeatmap } from "./charts/RhythmHeatmap"
import { StalledChart } from "./charts/StalledChart"
import { TimelineChart } from "./charts/TimelineChart"
import { TrendChart } from "./charts/TrendChart"

/** "전체"는 고정 경계가 없어 실제 데이터의 가장 이른 시점부터 지금까지로 범위를 잡는다. */
function resolveRange(period: PeriodFilter, sessions: SessionLogItem[], operations: OperationItem[], now: Date): PeriodRange {
  if (period !== "전체") return getPeriodRange(period, now)

  const starts = [
    ...sessions.map((s) => s.date),
    ...operations.map((o) => o.started_at),
  ]
    .filter((d): d is string => Boolean(d))
    .map((d) => new Date(d).getTime())

  const start = starts.length > 0 ? new Date(Math.min(...starts)) : now
  return { start, end: now }
}

export function LedgerCharts({
  operations,
  sessions,
  period,
  now,
}: {
  operations: OperationItem[]
  sessions: SessionLogItem[]
  period: PeriodFilter
  now: Date
}) {
  const range = useMemo(() => resolveRange(period, sessions, operations, now), [period, sessions, operations, now])
  const granularity = useMemo(() => bucketGranularityForPeriod(period), [period])
  const buckets = useMemo(() => buildTimeBuckets(period, range), [period, range])
  const trendRows = useMemo(() => aggregateTrend(sessions, buckets), [sessions, buckets])
  const domainShares = useMemo(() => computeDomainShare(sessions), [sessions])
  const trendDomains = useMemo(() => domainShares.map((s) => s.domain), [domainShares])
  const rhythmCells = useMemo(() => computeRhythmMatrix(sessions), [sessions])
  const stalledRows = useMemo(() => computeStalledRanking(operations, now), [operations, now])
  const leadTimeRows = useMemo(() => computeLeadTimeByDomain(operations), [operations])
  const timelineRows = useMemo(() => buildTimelineRows(operations), [operations])

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <DomainShareChart shares={domainShares} />
      <TrendChart rows={trendRows} domains={trendDomains} granularity={granularity} />
      <RhythmHeatmap cells={rhythmCells} />
      <StalledChart rows={stalledRows} />
      <LeadTimeChart rows={leadTimeRows} />
      <div className="lg:col-span-2">
        <TimelineChart rows={timelineRows} />
      </div>
    </div>
  )
}
