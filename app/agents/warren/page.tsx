"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { TopBar } from "@/components/layout/TopBar"
import { AgentChat } from "@/components/layout/AgentChat"
import { VaultDashboard } from "@/components/vault/VaultDashboard"
import type { PricesResponse, AssetPrice, VaultNewsResponse } from "@/lib/types/vault"

const TABS = [
  { id: "charts", label: "Charts", icon: "📊" },
  { id: "news", label: "News", icon: "📰" },
] as const

type VaultTab = (typeof TABS)[number]["id"]

export default function VaultPage() {
  const [activeTab, setActiveTab] = useState<VaultTab>("charts")

  const { data, isLoading: isPricesLoading } = useQuery({
    queryKey: ["vault-prices"],
    queryFn: async () => {
      const res = await fetch("/api/vault/prices")
      if (!res.ok) throw new Error("시세 조회 실패")
      return res.json() as Promise<PricesResponse>
    },
    refetchInterval: 2 * 60 * 1000,
  })

  const { data: newsData, isLoading: isNewsLoading } = useQuery<VaultNewsResponse>({
    queryKey: ["vault-news"],
    queryFn: async () => {
      const res = await fetch("/api/vault/news")
      if (!res.ok) throw new Error("뉴스 조회 실패")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const prices: AssetPrice[] = data?.prices ?? []
  const newsItems = newsData?.items ?? []
  const btc = prices.find((p) => p.symbol === "BTC")
  const btcNews = newsItems.find((n) => n.asset === "BTC")

  const indicators = data?.indicators ?? []
  const fngIndicator = indicators.find((i) => i.key === "fng")
  const fngValue = fngIndicator?.value ?? null

  function getMessageForTab(tab: VaultTab): string {
    if (tab === "news") {
      if (newsItems.length > 0) {
        return `여선생, 오늘 ${newsItems.length}건 뉴스 중 "${newsItems[0].title}" 이게 주목할 만해요.`
      }
      return "여선생, 지금은 새 뉴스가 없어요. 시세 먼저 보시죠."
    }

    // charts 탭 — 비트코인 중심 (가격 변동 + BTC 뉴스 headline)
    if (prices.length === 0) return "여선생, 시장 시세 가져오고 있어요. 잠시만요."
    if (!btc) return "여선생, 비트코인 시세를 못 가져오고 있어요. 잠시 후 다시."

    const ch = btc.change24h ?? 0
    const sign = ch >= 0 ? "+" : ""
    const pct = `${sign}${ch.toFixed(2)}%`
    const priceStr = btc.price >= 1000
      ? `$${Math.round(btc.price).toLocaleString("en-US")}`
      : `$${btc.price.toFixed(2)}`
    const newsSnippet = btcNews ? `"${btcNews.title}"` : null

    // 큰 하락
    if (ch <= -5) {
      if (newsSnippet) return `여선생, 비트코인 ${pct} (${priceStr}). ${newsSnippet}. 남들이 무서워할 때 기회일 수 있죠.`
      return `여선생, 비트코인 ${pct} (${priceStr}). 공포장이에요. 차분하게 보세요.`
    }
    // 큰 상승
    if (ch >= 5) {
      if (newsSnippet) return `여선생, 비트코인 ${pct} (${priceStr}). ${newsSnippet}. 들뜨지 마시고 왜 올랐는지 보시죠.`
      return `여선생, 비트코인 ${pct} (${priceStr}). 강한 랠리네요. 왜 올랐는지 먼저 확인.`
    }
    // 완만한 움직임 (±2~5%)
    if (Math.abs(ch) >= 2) {
      if (newsSnippet) return `여선생, 비트코인 ${pct} (${priceStr}). ${newsSnippet}. 추세인지 잡음인지 차분히.`
      return `여선생, 비트코인 ${pct} (${priceStr}). 방향성 슬슬 잡히나 보시죠.`
    }
    // 횡보 — FNG 끼워넣기
    if (fngValue !== null && (fngValue < 30 || fngValue > 70)) {
      const fngMsg = fngValue < 30 ? "남들 무서워할 때가 기회일 수 있죠." : "과열 구간이니 차분하게."
      return `여선생, 비트코인 ${pct} (${priceStr}), 공포지수 ${fngValue}. ${fngMsg}`
    }
    if (newsSnippet) return `여선생, 비트코인 ${pct} (${priceStr}). ${newsSnippet}.`
    return `여선생, 비트코인 ${pct} (${priceStr}). 횡보 중. 오늘은 지켜보는 날이에요.`
  }

  const message = getMessageForTab(activeTab)
  const isTabLoading =
    (activeTab === "charts" && isPricesLoading) ||
    (activeTab === "news" && isNewsLoading)

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="" />

      {/* Tabs */}
      <div className="border-b border-border bg-background sticky top-0 z-30 overflow-x-auto touch-pan-x">
        <div className="flex gap-0.5 px-3 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`
                px-3 py-2.5 text-xs sm:text-sm font-medium transition-colors relative whitespace-nowrap touch-manipulation select-none
                ${activeTab === tab.id ? "text-foreground" : "text-muted-foreground hover:text-foreground/90"}
              `}
            >
              <span className="flex items-center gap-1.5">
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </span>
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-500 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 p-3 md:p-6 max-w-[1680px] w-full">
        <AgentChat
          agentId="warren"
          image="/warren.png"
          name="Warren"
          greeting={isTabLoading ? "..." : message}
          api="/api/warren/conversation"
        />
        <VaultDashboard view={activeTab} />
      </div>
    </div>
  )
}
