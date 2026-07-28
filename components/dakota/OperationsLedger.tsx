"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import type { OperationItem } from "@/lib/notion/operations"
import { isWithinPeriod, PERIOD_FILTERS, type PeriodFilter } from "@/lib/dakota-ledger/period"
import { LEDGER_SURFACES } from "@/lib/dakota-ledger/types"
import { LedgerCharts } from "./LedgerCharts"
import { LedgerMatrix } from "./LedgerMatrix"
import { OperationDetail } from "./OperationDetail"
import { fetchOperations, fetchSessions } from "./operationLabels"

/** "전체" + Surface 세 값. 세션에만 적용된다 — 과제(Operation)에는 surface가 없다. */
const SURFACE_FILTERS = ["전체", ...LEDGER_SURFACES] as const
type SurfaceFilter = (typeof SURFACE_FILTERS)[number]

export function OperationsLedger() {
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("전체")
  const [surfaceFilter, setSurfaceFilter] = useState<SurfaceFilter>("전체")
  const [selected, setSelected] = useState<OperationItem | null>(null)

  const now = useMemo(() => new Date(), [])

  const operationsQuery = useQuery({
    queryKey: ["dakota-operations"],
    queryFn: fetchOperations,
    refetchInterval: 60_000,
  })

  const sessionsQuery = useQuery({
    queryKey: ["dakota-ledger-sessions"],
    queryFn: fetchSessions,
    refetchInterval: 60_000,
  })

  const visibleOperations = useMemo(
    () => (operationsQuery.data?.operations ?? []).filter((op) => isWithinPeriod(op.last_touched, periodFilter, now)),
    [operationsQuery.data?.operations, periodFilter, now]
  )

  const visibleSessions = useMemo(
    () =>
      (sessionsQuery.data?.sessions ?? [])
        .filter((s) => isWithinPeriod(s.date, periodFilter, now))
        .filter((s) => surfaceFilter === "전체" || s.surface === surfaceFilter),
    [sessionsQuery.data?.sessions, periodFilter, surfaceFilter, now]
  )

  const isLoading = operationsQuery.isLoading || sessionsQuery.isLoading
  const error = operationsQuery.error ?? sessionsQuery.error
  const configured = operationsQuery.data?.configured

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-zinc-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        기록을 여는 중입니다.
      </div>
    )
  }
  if (error) return <p className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-200">{error.message}</p>
  if (!configured) return <p className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 text-sm text-zinc-400">운영 기록 DB 연결이 필요합니다.</p>

  return (
    <div className="space-y-6">
      <header className="border-b border-zinc-800 pb-5">
        <p className="text-xs font-medium tracking-[0.18em] text-zinc-500">DAKOTA · OPERATING REVIEW</p>
        <h1 className="mt-1 text-xl font-semibold text-white">Dakota가 실제로 한 일</h1>
      </header>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-800 pb-4">
        <span className="mr-1 text-[11px] font-medium tracking-wide text-zinc-500">기간</span>
        {PERIOD_FILTERS.map((filter) => (
          <button
            key={filter}
            onClick={() => setPeriodFilter(filter)}
            className={`rounded-md px-2.5 py-1.5 text-xs transition ${periodFilter === filter ? "bg-white text-zinc-950" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"}`}
          >
            {filter}
          </button>
        ))}
        <span className="mx-1 text-zinc-800">|</span>
        <span className="mr-1 text-[11px] font-medium tracking-wide text-zinc-500">표면</span>
        {SURFACE_FILTERS.map((filter) => (
          <button
            key={filter}
            onClick={() => setSurfaceFilter(filter)}
            className={`rounded-md px-2.5 py-1.5 text-xs transition ${surfaceFilter === filter ? "bg-white text-zinc-950" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"}`}
          >
            {filter}
          </button>
        ))}
        <span className="ml-auto shrink-0 text-xs text-zinc-500">
          {visibleSessions.length}세션 · {visibleOperations.length}과제
        </span>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-white">카테고리별 현황</h2>
        {surfaceFilter !== "전체" && (
          <p className="text-[11px] text-zinc-500">
            이 매트릭스와 정체·리드타임·타임라인 차트는 과제(Operation) 기반이라 표면 필터의 영향을 받지 않습니다 — 아래는 전체 표면의 과제입니다.
          </p>
        )}
        <LedgerMatrix operations={visibleOperations} onSelect={setSelected} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-white">분석</h2>
        <LedgerCharts operations={visibleOperations} sessions={visibleSessions} period={periodFilter} now={now} />
      </section>

      {selected && <OperationDetail item={selected} close={() => setSelected(null)} />}
    </div>
  )
}
