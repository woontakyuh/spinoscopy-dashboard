"use client"

import { useQuery } from "@tanstack/react-query"

// Player Profile의 "Working hypothesis" 섹션을 persistent 상단 배너로 표시.
// Notion 미연결·섹션 없음 시 friendly fallback.

interface PlayerProfileSections {
  workingHypothesis: string | null
}

export function WorkingHypothesisBanner({ text }: { text?: string }) {
  const { data } = useQuery<PlayerProfileSections>({
    queryKey: ["player-profile-sections"],
    queryFn: async () => {
      const r = await fetch("/api/notion/player-profile")
      if (!r.ok) throw new Error("profile err")
      return r.json()
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
    enabled: !text,
  })

  const body =
    text ??
    data?.workingHypothesis ??
    "Player Profile에 '## Working hypothesis' 섹션을 추가하면 여기 표시돼."

  return (
    <div className="rounded-xl border border-[#1D9E75]/30 bg-[#0F6E56]/10 px-4 py-3 mb-4">
      <div className="flex items-start gap-2">
        <span className="text-[11px] font-semibold tracking-wider text-[#1D9E75] uppercase shrink-0 mt-0.5">
          Hypothesis
        </span>
        <p className="text-[13px] text-foreground/90 leading-relaxed whitespace-pre-wrap line-clamp-3">
          {body}
        </p>
      </div>
    </div>
  )
}
