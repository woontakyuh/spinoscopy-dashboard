"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import type { WikiSnapshotItem } from "@/lib/notion/wikiState"
import { computeWikiStaleDays, detectSourceMismatch } from "@/lib/dakota-ledger/wikiState"
import { tone as stalledTone } from "./charts/StalledChart"
import { WikiEventsChart } from "./charts/WikiEventsChart"

interface WikiResponse {
  configured: boolean
  snapshots: WikiSnapshotItem[]
}

async function fetchWiki(): Promise<WikiResponse> {
  const res = await fetch("/api/dakota/wiki")
  if (!res.ok) throw new Error("위키 상태를 불러오지 못했습니다.")
  return res.json()
}

function byDateAsc(a: WikiSnapshotItem, b: WikiSnapshotItem): number {
  return (a.date ?? "").localeCompare(b.date ?? "")
}

/**
 * 사용자의 말대로 "거의 안 쓰긴해. 그래도 해놓긴 해야지" — 이 패널이 보여줘야 할
 * 단 하나의 사실은 "얼마나 오래 방치됐는가"다. 활동이 건강해 보이는 트렌드 차트를
 * 만들지 않는다: 이벤트가 3건 미만이면 상태 블록만 보여주고, 3건 이상일 때만
 * 작은 생성/갱신/삭제 막대 계열을 덧붙인다.
 */
export function WikiPanel() {
  const now = useMemo(() => new Date(), [])

  const { data, isLoading, error } = useQuery({
    queryKey: ["dakota-wiki"],
    queryFn: fetchWiki,
    refetchInterval: 60_000,
  })

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">위키 상태를 불러오는 중입니다.</p>
  }
  if (error) {
    return <p className="text-xs text-muted-foreground">{(error as Error).message}</p>
  }

  const configured = data?.configured ?? false
  const snapshots = data?.snapshots ?? []

  if (!configured || snapshots.length === 0) {
    return <p className="text-xs text-muted-foreground">LLM Wiki 상태가 아직 동기화되지 않았어요.</p>
  }

  const sorted = snapshots.slice().sort(byDateAsc)
  const latest = sorted[sorted.length - 1]

  const totalPages = latest.totalPages ?? 0
  const totalSources = latest.totalSources ?? totalPages
  const mismatch = detectSourceMismatch(totalSources, totalPages)
  const staleDays = latest.date ? computeWikiStaleDays(latest.date, now) : null

  return (
    <section className="space-y-2">
      <div className="border border-border bg-card p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">LLM Wiki</h2>
          <span className="shrink-0 text-[11px] tabular-nums" style={{ color: stalledTone(staleDays) }}>
            마지막 컴파일 {staleDays === null ? "알 수 없음" : `${staleDays}일 전`}
          </span>
        </div>
        <p className="mt-2 text-xs text-foreground">
          {totalPages} 페이지 · {mismatch.label}
        </p>
        {latest.layers && <p className="mt-1 text-[11px] text-muted-foreground">{latest.layers}</p>}
        {latest.kinds && <p className="mt-1 text-[11px] text-muted-foreground">{latest.kinds}</p>}
      </div>

      {sorted.length >= 3 && (
        <WikiEventsChart
          rows={sorted.map((s) => ({
            label: (s.date ?? "").slice(0, 10),
            created: s.created,
            updated: s.updated,
            deleted: s.deleted,
          }))}
        />
      )}
    </section>
  )
}
