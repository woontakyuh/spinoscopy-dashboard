"use client"

import { useQuery } from "@tanstack/react-query"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { maskPatientName } from "@/lib/utils"

interface DashboardSurgeryItem {
  page_id: string
  name: string
  op_name: string
  op_date: string | null
  hospital: string
  url: string
}

async function fetchSurgeries(): Promise<DashboardSurgeryItem[]> {
  const res = await fetch("/api/dashboard/surgery")
  if (!res.ok) throw new Error("수술 로딩 실패")
  return res.json()
}

export function TodaySurgery() {
  const { data: surgeries, isLoading, error } = useQuery({
    queryKey: ["dashboard-surgery"],
    queryFn: fetchSurgeries,
    refetchInterval: 60000,
  })

  if (isLoading) {
    return (
      <div className="border border-border rounded-xl bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground/90 mb-3">🏥 오늘 수술</h3>
        <Skeleton className="h-12 w-full bg-muted" />
      </div>
    )
  }

  return (
    <div className="border border-border rounded-xl bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground/90 uppercase tracking-wider mb-3">
        🏥 오늘 수술 ({surgeries?.length ?? 0})
      </h3>

      {error ? (
        <p className="text-red-400 text-sm">수술 데이터를 불러오지 못했습니다.</p>
      ) : (surgeries ?? []).length === 0 ? (
        <EmptyState icon="🩺" message="오늘 예정된 수술이 없습니다." />
      ) : (
        <div className="space-y-2">
          {(surgeries ?? []).map((surgery) => (
            <a
              key={surgery.page_id}
              href={surgery.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 bg-muted border border-border rounded-lg px-4 py-3 hover:border-border card-hover"
            >
              <div className="w-10 h-10 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center text-lg shrink-0">
                🔪
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-foreground text-sm font-medium truncate">{maskPatientName(surgery.name)}</p>
                <p className="text-muted-foreground text-xs truncate mt-0.5">{surgery.op_name || "수술명 미기재"}</p>
                {surgery.hospital && <p className="text-muted-foreground text-xs mt-0.5">📍 {surgery.hospital}</p>}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
