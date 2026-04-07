"use client"

import { useQuery } from "@tanstack/react-query"
import { Skeleton } from "@/components/ui/skeleton"
import { PromDisplay } from "@/components/clinicus/PromDisplay"
import { PromChart } from "@/components/clinicus/PromChart"
import type { PatientSearchResult } from "@/lib/types/patient"

interface Props {
  patient: PatientSearchResult
  onOpenNotion?: () => void
}

export function PatientDetail({ patient, onOpenNotion }: Props) {
  const { data: promRecord, isLoading } = useQuery({
    queryKey: ["prom", patient.page_id],
    queryFn: async () => {
      const res = await fetch(`/api/notion/patients?pageId=${patient.page_id}`)
      if (!res.ok) throw new Error("PROM 조회 실패")
      return res.json() as Promise<Record<string, string>>
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-foreground font-semibold text-base">{patient.name}</p>
          <p className="text-muted-foreground text-sm mt-0.5">
            {patient.pt_no && `#${patient.pt_no} · `}
            {patient.age && `${patient.age}세 · `}
            {patient.sex}
            {patient.hospital.length > 0 && ` · ${patient.hospital.join(", ")}`}
          </p>
          {patient.op_name && (
            <p className="text-muted-foreground text-xs mt-1">
              {patient.op_name}
              {patient.op_date && ` · ${new Date(patient.op_date).toLocaleDateString("ko-KR")}`}
            </p>
          )}
        </div>
        {onOpenNotion && (
          <button
            type="button"
            onClick={onOpenNotion}
            className="text-xs text-muted-foreground hover:text-foreground/90 border border-border hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-colors shrink-0"
          >
            Notion ↗
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full bg-muted" />)}
        </div>
      ) : promRecord ? (
        <div className="space-y-5">
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-3">환산 점수</p>
            <PromDisplay patient={patient} />
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-3">추이 그래프</p>
            <PromChart promRecord={promRecord} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
