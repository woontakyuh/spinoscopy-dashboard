"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ChevronDown, ChevronUp, ChevronsUpDown, Loader2 } from "lucide-react"
import type { OperationItem } from "@/lib/notion/operations"
import { OPERATION_DOMAINS } from "@/lib/notion/operations"
import { computeStalledDays, isWithinPeriod, PERIOD_FILTERS, type PeriodFilter } from "@/lib/dakota-ledger/period"
import { OperationDetail } from "./OperationDetail"
import {
  DOMAIN_LABEL,
  DOMAIN_TONE,
  fetchOperations,
  PRIORITY_ORDER,
  PRIORITY_TONE,
  STATUS_LABEL,
  STATUS_TONE,
} from "./operationLabels"

type DomainFilter = "전체" | OperationItem["domain"]
const DOMAIN_FILTERS: DomainFilter[] = ["전체", ...OPERATION_DOMAINS]

const CLOSED_STATUSES = new Set<OperationItem["status"]>(["Completed", "Archived"])

type SortKey =
  | "name" | "domain" | "status" | "priority"
  | "session_count" | "msg_total" | "started_at" | "last_touched"
  | "stalled_days" | "next_action"
type SortDirection = "asc" | "desc"

interface SortState {
  key: SortKey
  direction: SortDirection
}

interface Column {
  key: SortKey
  label: string
  align?: "right"
}

const COLUMNS: Column[] = [
  { key: "name", label: "과제명" },
  { key: "domain", label: "도메인" },
  { key: "status", label: "상태" },
  { key: "priority", label: "우선순위" },
  { key: "session_count", label: "세션", align: "right" },
  { key: "msg_total", label: "메시지", align: "right" },
  { key: "started_at", label: "시작" },
  { key: "last_touched", label: "최근" },
  { key: "stalled_days", label: "정체일수", align: "right" },
  { key: "next_action", label: "다음 행동" },
]

const DEFAULT_DIRECTION: Record<SortKey, SortDirection> = {
  name: "asc",
  domain: "asc",
  status: "asc",
  priority: "desc",
  session_count: "desc",
  msg_total: "desc",
  started_at: "desc",
  last_touched: "desc",
  stalled_days: "desc",
  next_action: "asc",
}

interface Row {
  item: OperationItem
  stalledDays: number | null
}

/** null은 정렬 방향과 무관하게 항상 맨 뒤로 보낸다. */
function compareNullableLast<T>(a: T | null, b: T | null, compare: (a: T, b: T) => number): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return compare(a, b)
}

function sortRows(rows: Row[], sort: SortState): Row[] {
  const dir = sort.direction === "asc" ? 1 : -1
  return [...rows].sort((ra, rb) => {
    switch (sort.key) {
      case "name":
        return dir * ra.item.name.localeCompare(rb.item.name, "ko")
      case "domain":
        return dir * (DOMAIN_LABEL[ra.item.domain] ?? ra.item.domain).localeCompare(DOMAIN_LABEL[rb.item.domain] ?? rb.item.domain, "ko")
      case "status":
        return dir * (STATUS_LABEL[ra.item.status] ?? ra.item.status).localeCompare(STATUS_LABEL[rb.item.status] ?? rb.item.status, "ko")
      case "priority":
        return dir * ((PRIORITY_ORDER[ra.item.priority] ?? 0) - (PRIORITY_ORDER[rb.item.priority] ?? 0))
      case "session_count":
        return dir * (ra.item.session_count - rb.item.session_count)
      case "msg_total":
        return dir * (ra.item.msg_total - rb.item.msg_total)
      case "started_at":
        return compareNullableLast(ra.item.started_at, rb.item.started_at, (a, b) => dir * (new Date(a).getTime() - new Date(b).getTime()))
      case "last_touched":
        return compareNullableLast(ra.item.last_touched, rb.item.last_touched, (a, b) => dir * (new Date(a).getTime() - new Date(b).getTime()))
      case "stalled_days":
        return compareNullableLast(ra.stalledDays, rb.stalledDays, (a, b) => dir * (a - b))
      case "next_action":
        return dir * ra.item.next_action.localeCompare(rb.item.next_action, "ko")
      default:
        return 0
    }
  })
}

function formatDate(value: string | null): string {
  return value ? value.slice(0, 10) : "–"
}

function stalledTextTone(days: number | null): string {
  if (days === null) return "text-zinc-600"
  if (days > 30) return "text-red-300 font-semibold"
  if (days > 14) return "text-amber-300 font-medium"
  return "text-zinc-300"
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ChevronsUpDown className="h-3 w-3 text-zinc-600" />
  return direction === "asc" ? <ChevronUp className="h-3 w-3 text-zinc-200" /> : <ChevronDown className="h-3 w-3 text-zinc-200" />
}

export function OperationsLedger() {
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("전체")
  const [domainFilter, setDomainFilter] = useState<DomainFilter>("전체")
  const [sort, setSort] = useState<SortState>({ key: "stalled_days", direction: "desc" })
  const [selected, setSelected] = useState<OperationItem | null>(null)

  const now = useMemo(() => new Date(), [])

  const { data, isLoading, error } = useQuery({
    queryKey: ["dakota-operations"],
    queryFn: fetchOperations,
    refetchInterval: 60_000,
  })

  const total = data?.operations.length ?? 0

  const visible = useMemo(
    () =>
      (data?.operations ?? []).filter(
        (item) => (domainFilter === "전체" || item.domain === domainFilter) && isWithinPeriod(item.last_touched, periodFilter, now)
      ),
    [data?.operations, domainFilter, periodFilter, now]
  )

  const rows = useMemo<Row[]>(
    () =>
      visible.map((item) => ({
        item,
        stalledDays: CLOSED_STATUSES.has(item.status) ? null : computeStalledDays(item.last_touched, now),
      })),
    [visible, now]
  )

  const sortedRows = useMemo(() => sortRows(rows, sort), [rows, sort])

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: DEFAULT_DIRECTION[key] }))
  }

  if (isLoading) return <div className="flex h-48 items-center justify-center text-sm text-zinc-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" />기록을 여는 중입니다.</div>
  if (error) return <p className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-200">{error.message}</p>
  if (!data?.configured) return <p className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 text-sm text-zinc-400">운영 기록 DB 연결이 필요합니다.</p>

  return (
    <div className="space-y-5">
      <header className="border-b border-zinc-800 pb-5">
        <p className="text-xs font-medium tracking-[0.18em] text-zinc-500">DAKOTA · OPERATING REVIEW</p>
        <h1 className="mt-1 text-xl font-semibold text-white">Dakota가 실제로 한 일</h1>
      </header>

      <div className="flex flex-col gap-3 border-b border-zinc-800 pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
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
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-medium tracking-wide text-zinc-500">도메인</span>
          {DOMAIN_FILTERS.map((filter) => (
            <button
              key={filter}
              onClick={() => setDomainFilter(filter)}
              className={`rounded-md px-2.5 py-1.5 text-xs transition ${domainFilter === filter ? "bg-white text-zinc-950" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"}`}
            >
              {filter === "전체" ? "전체" : DOMAIN_LABEL[filter] ?? filter}
            </button>
          ))}
          <span className="ml-auto shrink-0 text-xs text-zinc-500">{sortedRows.length} / {total}</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[980px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-500">
              {COLUMNS.map((col) => (
                <th key={col.key} className={`whitespace-nowrap px-3 py-2.5 font-medium ${col.align === "right" ? "text-right" : "text-left"}`}>
                  <button
                    onClick={() => toggleSort(col.key)}
                    className={`inline-flex items-center gap-1 hover:text-zinc-200 ${col.align === "right" ? "flex-row-reverse" : ""}`}
                  >
                    {col.label}
                    <SortIcon active={sort.key === col.key} direction={sort.direction} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-8 text-center text-zinc-600">조건에 맞는 기록이 없습니다.</td>
              </tr>
            )}
            {sortedRows.map(({ item, stalledDays }) => (
              <tr
                key={item.page_id}
                onClick={() => setSelected(item)}
                className="cursor-pointer border-b border-zinc-900 last:border-0 hover:bg-zinc-900/50"
              >
                <td className="max-w-[240px] truncate px-3 py-2.5 font-medium text-zinc-100" title={item.name}>{item.name}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-medium ${DOMAIN_TONE[item.domain] ?? DOMAIN_TONE.Operations}`}>
                    {DOMAIN_LABEL[item.domain] ?? item.domain}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-medium ${STATUS_TONE[item.status] ?? STATUS_TONE.Inbox}`}>
                    {STATUS_LABEL[item.status] ?? item.status}
                  </span>
                </td>
                <td className={`whitespace-nowrap px-3 py-2.5 ${PRIORITY_TONE[item.priority] ?? "text-zinc-400"}`}>{item.priority}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-zinc-300">{item.session_count}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-zinc-300">{item.msg_total}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-zinc-400">{formatDate(item.started_at)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-zinc-400">{formatDate(item.last_touched)}</td>
                <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${stalledTextTone(stalledDays)}`}>
                  {stalledDays === null ? "–" : `${stalledDays}일`}
                </td>
                <td className="max-w-[280px] truncate px-3 py-2.5 text-zinc-400" title={item.next_action}>{item.next_action || "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && <OperationDetail item={selected} close={() => setSelected(null)} />}
    </div>
  )
}
