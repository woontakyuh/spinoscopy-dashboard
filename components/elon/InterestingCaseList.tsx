"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import type { InterestingCase } from "@/lib/notion/interestingCases"
import { maskPatientName } from "@/lib/utils"

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

  const [expandedId, setExpandedId] = useState<string | null>(null)

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
        <span className="text-[10px] text-muted-foreground/60">
          카드 탭 → 상세 펼침 · 📝 아이콘 → Notion
        </span>
      </div>
      <div className="grid gap-2">
        {data.map((c) => {
          const isOpen = expandedId === c.page_id
          const reason = c.ai_insight?.trim() || c.note?.trim() || ""
          return (
            <div
              key={c.page_id}
              className="border border-border rounded-xl bg-card hover:bg-card/80 transition-colors"
            >
              <button
                type="button"
                onClick={() => setExpandedId(isOpen ? null : c.page_id)}
                className="w-full text-left p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-foreground truncate">
                        {maskPatientName(c.name) || "(이름 없음)"}
                      </h3>
                      {c.pt_no && (
                        <span className="text-[11px] text-muted-foreground">#{c.pt_no}</span>
                      )}
                      {c.age && c.sex && (
                        <span className="text-[11px] text-muted-foreground">
                          {c.age}/{c.sex}
                        </span>
                      )}
                      {c.op_date && (
                        <span className="text-[11px] text-muted-foreground">
                          · Op {c.op_date.slice(0, 10)}
                        </span>
                      )}
                    </div>
                    {c.preop_dx && (
                      <p className="text-xs text-foreground/80 mt-1 line-clamp-1">{c.preop_dx}</p>
                    )}
                    {reason ? (
                      <div className="mt-2 border-l-2 border-amber-500/40 pl-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-500/80 mb-0.5">
                          {c.ai_insight ? "AI Insight" : "Note"}
                        </p>
                        <p
                          className={`text-xs text-foreground/90 whitespace-pre-wrap ${
                            isOpen ? "" : "line-clamp-3"
                          }`}
                        >
                          {reason}
                        </p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground/60 mt-1 italic">
                        AI Insight·Note 미입력 — Notion에서 추가하면 여기 표시됨
                      </p>
                    )}
                    {/* 확장 시 추가 정보 */}
                    {isOpen && (
                      <div className="mt-2 space-y-1.5 text-xs">
                        {c.op_name && (
                          <div>
                            <span className="text-muted-foreground">Op: </span>
                            <span className="text-foreground/90">{c.op_name}</span>
                          </div>
                        )}
                        {c.cx && (
                          <div className="border-l-2 border-red-500/40 pl-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-red-500/80 mb-0.5">
                              Cx
                            </p>
                            <p className="text-foreground/90 whitespace-pre-wrap">{c.cx}</p>
                          </div>
                        )}
                        {c.note && c.note !== reason && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
                              Note
                            </p>
                            <p className="text-foreground/80 whitespace-pre-wrap">{c.note}</p>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
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
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className="text-[10px] text-muted-foreground">
                      {fmtRelative(c.last_edited_time)}
                    </span>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="Notion에서 열기"
                      className="text-sm p-1.5 rounded hover:bg-muted transition-colors"
                    >
                      📝
                    </a>
                    <span
                      className={`text-[10px] text-muted-foreground/60 transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    >
                      ▾
                    </span>
                  </div>
                </div>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
