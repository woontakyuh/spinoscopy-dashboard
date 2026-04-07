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

  const top5 = items.filter((i) => i.importanceScore === 5).length
  let message: string
  if (items.length === 0) {
    message = "피드 가져오는 중입니다. 곧 fresh한 거 보여드릴게요."
  } else if (top5 >= 3) {
    message = `오늘 핫합니다 — 중요도 5짜리만 ${top5}건이에요. 이건 꼭 보셔야 해요.`
  } else if (todayItems.length === 0) {
    message = `오늘은 새로 들어온 게 없네요. 중요도 4+ ${high}건은 아직 안 보신 것들이니 한번 훑어보시죠.`
  } else if (high >= 5) {
    message = `오늘 ${todayItems.length}건 들어왔고, 그 중 중요도 4+ ${high}건. 양 좀 되네요. 핵심부터 가시죠.`
  } else {
    message = `오늘 ${todayItems.length}건. 그중 ${high}건이 주목할 만해요 — 5분만 투자해보시죠.`
  }

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="" />
      <div className="p-3 md:p-6 max-w-4xl w-full">
        <AgentGreeter image="/andrej.png" name="Andrej" message={message} loading={isLoading} />
        <RadarFeed />
      </div>
    </div>
  )
}
