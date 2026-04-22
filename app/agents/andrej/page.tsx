"use client"

import { useQuery } from "@tanstack/react-query"
import { TopBar } from "@/components/layout/TopBar"
import { AgentChat } from "@/components/layout/AgentChat"
import { RadarFeed } from "@/components/radar/RadarFeed"
import { getTimeContext } from "@/lib/greeterContext"
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

  const top5Items = items.filter((i) => i.importanceScore === 5)
  const top5 = top5Items.length
  const tc = getTimeContext()

  let message: string
  if (items.length === 0) {
    message = "운탁씨, 피드 가져오고 있어요. 곧 fresh한 거 보여드릴게요."
  } else if (tc.bucket === "morning") {
    if (top5Items.length > 0) {
      message = `운탁씨, 밤새 AI 세상에 뭐가 있었나 봐요. 오늘 핫한 건 "${top5Items[0].title}" — 이건 꼭 보세요.`
    } else {
      message = `운탁씨, 밤새 AI 세상에 뭐가 있었나 봐요. 오늘 ${todayItems.length}건 들어왔어요.`
    }
  } else if (top5 >= 3) {
    message = `운탁씨, 오늘 진짜 핫해요 — 중요도 5짜리만 ${top5}건. "${top5Items[0].title}" 이건 꼭 보셔야 해요.`
  } else if (top5Items.length > 0) {
    message = `운탁씨, 오늘 핫한 건 "${top5Items[0].title}" — 이건 꼭 보세요.`
  } else if (todayItems.length === 0) {
    message = `운탁씨, 오늘은 새로 들어온 게 없네요. 그래도 중요도 4+ ${high}건이 아직 미확인이에요. 한번 훑어보시죠.`
  } else if (high >= 5) {
    message = `운탁씨, 오늘 ${todayItems.length}건 들어왔는데 그중 중요도 4+가 ${high}건. 양 좀 되네요 — 핵심부터 가시죠.`
  } else {
    message = `운탁씨, 오늘 ${todayItems.length}건이고 ${high}건이 주목할 만해요. 5분만 투자해보시죠.`
  }

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="" />
      <div className="p-3 md:p-6 w-full">
        <AgentChat agentId="andrej" image="/andrej.png" name="Andrej" greeting={isLoading ? "..." : message} />
        <RadarFeed />
      </div>
    </div>
  )
}
