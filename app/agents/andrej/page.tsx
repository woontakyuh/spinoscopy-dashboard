"use client"

import { useQuery } from "@tanstack/react-query"
import { Podcast, Radar as RadarIcon, Telescope } from "lucide-react"
import { useState } from "react"
import { TopBar } from "@/components/layout/TopBar"
import { AgentChat } from "@/components/layout/AgentChat"
import { FrontierDashboard } from "@/components/andrej/frontier/FrontierDashboard"
import { RadarFeed } from "@/components/radar/RadarFeed"
import { getTimeContext } from "@/lib/greeterContext"
import type { AiFrontierIndex } from "@/lib/types/ai-frontier"
import type { AiFrontierSource } from "@/lib/types/ai-frontier-import"
import type { FeedResponse } from "@/lib/types/radar"
import { filterFrontierIndexBySource } from "@/components/andrej/frontier/frontier-source"

const TABS = [
  { id: "radar", label: "Radar", Icon: RadarIcon },
  { id: "frontier", label: "AI Frontier", Icon: Telescope },
  { id: "dwarkesh", label: "Dwarkesh", Icon: Podcast },
] as const

type AndrejTab = (typeof TABS)[number]["id"]

// FrontierDashboard 와 같은 키·같은 staleTime 을 쓴다. 하나라도 어긋나면
// 탭을 열 때 같은 index 를 두 번 가져온다. (그쪽 상수를 공유 모듈로 빼는 건 이번 범위 밖)
const FRONTIER_KEY = ["andrej-frontier"] as const
const FRONTIER_STALE_TIME = 10 * 60 * 1000

function todaySeoul(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

async function fetchFrontierIndex(): Promise<AiFrontierIndex> {
  const res = await fetch("/api/andrej/frontier")
  if (!res.ok) throw new Error(`frontier index ${res.status}`)
  return (await res.json()) as AiFrontierIndex
}

export default function RadarPage() {
  const [activeTab, setActiveTab] = useState<AndrejTab>("radar")

  const { data, isLoading } = useQuery({
    queryKey: ["radar-feed"],
    queryFn: async () => {
      const res = await fetch("/api/ai-feed")
      if (!res.ok) throw new Error("피드 조회 실패")
      return res.json() as Promise<FeedResponse>
    },
    staleTime: 5 * 60 * 1000,
  })

  // 보고 있을 때만 물어본다. Radar 탭에서는 요청이 나가지 않는다.
  const {
    data: frontier,
    isPending: isFrontierPending,
    isError: isFrontierError,
  } = useQuery({
    queryKey: FRONTIER_KEY,
    queryFn: fetchFrontierIndex,
    staleTime: FRONTIER_STALE_TIME,
    refetchOnWindowFocus: false,
    enabled: activeTab !== "radar",
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

  function frontierMessage(): string {
    const source: AiFrontierSource =
      activeTab === "dwarkesh" ? "dwarkesh" : "ai-frontier"
    const sourceLabel = source === "dwarkesh" ? "Dwarkesh" : "AI Frontier"
    if (isFrontierPending) {
      return `운탁씨, ${sourceLabel} 지식 라이브러리를 불러오고 있어요.`
    }

    // 양쪽 소스가 다 끊긴 건 요청 실패와 같은 상태다 — 화면에 세울 게 없다.
    const bothDown =
      frontier !== undefined &&
      frontier.sources.episodes === "unavailable" &&
      frontier.sources.concepts === "unavailable"
    if (isFrontierError || frontier === undefined || bothDown) {
      return `운탁씨, ${sourceLabel}는 지금 Notion 연결을 확인해야 해요. Radar는 정상적으로 볼 수 있습니다.`
    }

    const sourceIndex = filterFrontierIndexBySource(frontier, source)
    const episodes = sourceIndex.episodes.length
    const concepts = sourceIndex.concepts.length
    const unreviewed = sourceIndex.episodes.filter((episode) => !episode.reviewed).length
    return `운탁씨, ${sourceLabel}에 에피소드 ${episodes}개와 개념 ${concepts}개가 정리돼 있어요. 검토 대기는 ${unreviewed}개입니다.`
  }

  const greeting =
    activeTab !== "radar" ? frontierMessage() : isLoading ? "..." : message

  const panelId = `andrej-panel-${activeTab}`
  const activeTabId = `andrej-tab-${activeTab}`

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="" />

      {/* Tabs */}
      <div className="border-b border-border bg-background sticky top-0 z-30 overflow-x-auto touch-pan-x">
        <div
          role="tablist"
          aria-label="Andrej 화면"
          className="flex gap-0.5 px-3 min-w-max"
        >
          {TABS.map((tab) => {
            const selected = activeTab === tab.id
            return (
              <button
                key={tab.id}
                id={`andrej-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={selected ? panelId : undefined}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  px-3 py-2.5 text-xs sm:text-sm font-medium transition-colors relative whitespace-nowrap touch-manipulation select-none
                  ${selected ? "text-foreground" : "text-muted-foreground hover:text-foreground/90"}
                `}
              >
                <span className="flex items-center gap-1.5">
                  <tab.Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span>{tab.label}</span>
                </span>
                {selected && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500 rounded-full" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 p-3 md:p-6 w-full">
        <AgentChat
          agentId="andrej"
          image="/andrej.png"
          name="Andrej"
          greeting={greeting}
          api="/api/andrej/conversation"
        />

        <div id={panelId} role="tabpanel" aria-labelledby={activeTabId}>
          {activeTab === "radar" ? (
            <RadarFeed />
          ) : (
            <FrontierDashboard
              key={activeTab}
              source={activeTab === "dwarkesh" ? "dwarkesh" : "ai-frontier"}
            />
          )}
        </div>
      </div>
    </div>
  )
}
