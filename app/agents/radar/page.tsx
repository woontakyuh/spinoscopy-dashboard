"use client"

import { useQuery } from "@tanstack/react-query"
import { TopBar } from "@/components/layout/TopBar"
import { AgentGreeter } from "@/components/layout/AgentGreeter"
import { RadarFeed } from "@/components/radar/RadarFeed"
import type { FeedResponse } from "@/lib/types/radar"

function todaySeoul(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

export default function RadarPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["radar-feed"],
    queryFn: async () => {
      const res = await fetch("/api/ai-feed")
      if (!res.ok) throw new Error("피드 조회 실패")
      return res.json() as Promise<FeedResponse>
    },
    staleTime: 5 * 60 * 1000,
  })

  const items = data?.items ?? []
  const today = todaySeoul()
  const todayItems = items.filter((i) => i.date.slice(0, 10) === today)
  const high = items.filter((i) => i.importanceScore >= 4).length

  const message = items.length === 0
    ? "오늘은 아직 피드가 없네요. 곧 새 소식 가져올게요."
    : `오늘 새로운 피드 ${todayItems.length}건, 중요도 4+ ${high}건. 핵심부터 보여드릴게요.`

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="Andrej" icon="/andrej.png" />
      <div className="p-3 md:p-6 max-w-4xl w-full">
        <AgentGreeter image="/andrej.png" name="Andrej" message={message} loading={isLoading} />
        <RadarFeed />
      </div>
    </div>
  )
}
