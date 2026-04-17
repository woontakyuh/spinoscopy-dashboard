"use client"

import { useQuery } from "@tanstack/react-query"
import type { InterestingCase } from "@/lib/notion/interestingCases"

function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days < 1) return "오늘"
  if (days < 7) return `${days}일 전`
  if (days < 30) return `${Math.floor(days / 7)}주 전`
  return `${Math.floor(days / 30)}개월 전`
}

export function InterestingCaseList() {
  const { data, isLoading, error } = useQuery<InterestingCase[]>({
    queryKey: ["elon-interesting-cases"],
    queryFn: async () => {
      const res = await fetch("/api/notion/elon/interesting")
      if (!res.ok) throw new Error("interesting case 조회 실패")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return <p className="text-muted-foreground text-sm py-8 text-center">불러오는 중...</p>
  }
  if (error) {
    return <p className="text-red-400 text-sm py-8 text-center">{(error as Error).message}</p>
  }
  if (!data || data.length === 0) {
    return (
      <p className="text-muted-foreground text-sm py-8 text-center">
        Interesting case로 태그된 환자가 없음.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>총 {data.length}명 · 최근 수정순</span>
      </div>
      <div className="grid gap-2">
        {data.map((c) => (
          <a
            key={c.page_id}
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block border border-border rounded-xl p-3 bg-card hover:bg-card/80 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-foreground truncate">{c.name || "(이름 없음)"}</h3>
                  {c.pt_no && (
                    <span className="text-[11px] text-muted-foreground">#{c.pt_no}</span>
                  )}
                  {c.age && c.sex && (
                    <span className="text-[11px] text-muted-foreground">
                      {c.age}/{c.sex}
                    </span>
                  )}
                </div>
                {c.preop_dx && (
                  <p className="text-xs text-foreground/80 mt-1 line-clamp-2">{c.preop_dx}</p>
                )}
                {c.note && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.note}</p>
                )}
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {c.db_tags
                    .filter((t) => t !== "Interesting case")
                    .slice(0, 4)
                    .map((t) => (
                      <span
                        key={t}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  {c.hospital.slice(0, 2).map((h) => (
                    <span
                      key={h}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-300"
                    >
                      {h}
                    </span>
                  ))}
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {fmtRelative(c.last_edited_time)}
              </span>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
