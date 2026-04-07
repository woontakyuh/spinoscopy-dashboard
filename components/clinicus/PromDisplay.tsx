"use client"

import { useQuery } from "@tanstack/react-query"
import { Skeleton } from "@/components/ui/skeleton"
import {
  parseTimepointProm,
  inferRegion,
  type ParsedTimepoint,
} from "@/lib/prom/calculator"
import type { PatientSearchResult } from "@/lib/types/patient"

const TIMEPOINTS = [
  { value: "pre",  label: "수술 전" },
  { value: "1mo",  label: "1개월" },
  { value: "3mo",  label: "3개월" },
  { value: "6mo",  label: "6개월" },
  { value: "1y",   label: "1년" },
]

interface Props {
  patient: PatientSearchResult
}

// Small badge showing a score value
function ScoreBadge({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center bg-muted rounded-lg px-3 py-2 min-w-[72px]">
      <span className="text-muted-foreground text-[10px] uppercase tracking-wide">{label}</span>
      <span className="text-foreground font-semibold text-sm mt-0.5 num">{value}</span>
      {sub && <span className="text-muted-foreground text-[10px] mt-0.5">{sub}</span>}
    </div>
  )
}

function TimepointRow({ tp, region }: { tp: ParsedTimepoint; region: "cervical" | "lumbar" | "unknown" }) {
  const hasAny = tp.vas || tp.odi !== null || tp.joa !== null || tp.ndi || tp.eq5d

  if (!hasAny) {
    return (
      <div className="flex items-center gap-3 py-2">
        <span className="text-muted-foreground text-xs w-16 shrink-0 text-right">
          {TIMEPOINTS.find(t => t.value === tp.timepoint)?.label}
        </span>
        <span className="text-zinc-700 text-xs italic">데이터 없음</span>
      </div>
    )
  }

  const proxLabel = region === "cervical" ? "Neck" : region === "lumbar" ? "Back" : "VAS①"
  const distLabel = region === "cervical" ? "Arm" : region === "lumbar" ? "Leg" : "VAS②"

  return (
    <div className="flex items-start gap-3 py-2">
      <span className="text-muted-foreground text-xs w-16 shrink-0 text-right pt-2.5">
        {TIMEPOINTS.find(t => t.value === tp.timepoint)?.label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {tp.vas && (
          <>
            <ScoreBadge label={proxLabel} value={String(tp.vas.proximal)} />
            <ScoreBadge label={distLabel} value={String(tp.vas.distal)} />
          </>
        )}
        {tp.joa !== null && (
          <ScoreBadge label="JOA" value={String(tp.joa)} sub="/17" />
        )}
        {tp.odi && (
          <ScoreBadge label="ODI" value={`${tp.odi.score.toFixed(1)}%`} sub={`${tp.odi.raw}/${tp.odi.max}`} />
        )}
        {tp.ndi && (
          <ScoreBadge label="NDI" value={`${tp.ndi.score.toFixed(1)}%`} sub={`${tp.ndi.raw}/${tp.ndi.max}`} />
        )}
        {tp.eq5d && (
          <>
            <ScoreBadge label="EQ-5D" value={tp.eq5d.utility.toFixed(3)} sub={tp.eq5d.profile} />
            <ScoreBadge label="EQ VAS" value={String(tp.eq5d.vas)} sub="/100" />
          </>
        )}
      </div>
    </div>
  )
}

export function PromDisplay({ patient }: Props) {
  const { data: promRecord, isLoading } = useQuery({
    queryKey: ["prom", patient.page_id],
    queryFn: async () => {
      const res = await fetch(`/api/notion/patients?pageId=${patient.page_id}`)
      if (!res.ok) throw new Error("PROM 조회 실패")
      return res.json() as Promise<Record<string, string>>
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full bg-muted" />)}
      </div>
    )
  }

  if (!promRecord) return null

  const region = inferRegion(promRecord)
  const parsed = TIMEPOINTS.map(tp => parseTimepointProm(promRecord, tp.value))
  const hasData = parsed.some(tp => tp.vas || tp.odi !== null || tp.joa !== null || tp.ndi || tp.eq5d)

  if (!hasData) {
    return (
      <p className="text-muted-foreground/70 text-sm italic text-center py-4">
        기록된 PROM 데이터가 없습니다.
      </p>
    )
  }

  const regionLabel =
    region === "cervical" ? "경추" : region === "lumbar" ? "요추" : ""

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-2">
        <p className="text-muted-foreground text-xs">환산 점수 (Korean EQ-5D-5L, Kim et al. 2016)</p>
        {regionLabel && (
          <span className="text-xs bg-muted text-foreground/90 px-2 py-0.5 rounded-full">
            {regionLabel}
          </span>
        )}
      </div>
      <div className="divide-y divide-zinc-800">
        {parsed.map(tp => (
          <TimepointRow key={tp.timepoint} tp={tp} region={region} />
        ))}
      </div>
    </div>
  )
}
