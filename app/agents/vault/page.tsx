"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { TopBar } from "@/components/layout/TopBar"
import { AgentGreeter } from "@/components/layout/AgentGreeter"
import { VaultDashboard } from "@/components/vault/VaultDashboard"
import type { PricesResponse, AssetPrice } from "@/lib/types/vault"

const TABS = [
  { id: "charts", label: "Charts", icon: "📊" },
  { id: "news", label: "News", icon: "📰" },
] as const

type VaultTab = (typeof TABS)[number]["id"]

export default function VaultPage() {
  const [activeTab, setActiveTab] = useState<VaultTab>("charts")

  const { data, isLoading } = useQuery({
    queryKey: ["vault-prices"],
    queryFn: async () => {
      const res = await fetch("/api/vault/prices")
      if (!res.ok) throw new Error("시세 조회 실패")
      return res.json() as Promise<PricesResponse>
    },
    refetchInterval: 2 * 60 * 1000,
  })

  const prices: AssetPrice[] = data?.prices ?? []
  const withChange = prices.filter((p) => typeof p.change24h === "number")
  const top = withChange.slice().sort((a, b) => Math.abs((b.change24h ?? 0)) - Math.abs((a.change24h ?? 0)))[0]

  function getMessageForTab(tab: VaultTab): string {
    if (tab === "news") {
      return "여선생, 오늘 시장 관련 뉴스 모아뒀어요. 거시 흐름 읽는 데 도움이 됩니다."
    }
    // charts 탭 — prices 기반
    if (prices.length === 0) return "여선생, 시장 시세 가져오고 있어요. 잠시만요."
    if (!top) return `${prices.length}개 자산 지켜보고 있는데, 오늘은 큰 움직임 없어요. 좋은 신호일 수 있죠, 여선생.`
    const ch = top.change24h ?? 0
    const sign = ch >= 0 ? "+" : ""
    if (ch <= -5) return `여선생, ${top.symbol}이 오늘 ${sign}${ch.toFixed(2)}% 빠졌어요. 기본기 좋은 회사라면 이런 날이 오히려 기회일 수 있습니다.`
    if (ch >= 5) return `여선생, ${top.symbol}이 ${sign}${ch.toFixed(2)}% 올랐네요. 들뜨지 마시고 왜 올랐는지 한번 짚어보시죠.`
    return `여선생, 오늘 가장 큰 움직임은 ${top.symbol} ${sign}${ch.toFixed(2)}%. 단기 노이즈인지 추세인지 차분히 보시죠.`
  }

  const message = getMessageForTab(activeTab)

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="" />

      {/* Tabs */}
      <div className="border-b border-border bg-background sticky top-0 z-10 overflow-x-auto">
        <div className="flex gap-0.5 px-3 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`
                px-3 py-2.5 text-xs sm:text-sm font-medium transition-colors relative whitespace-nowrap
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
      <div className="flex-1 min-w-0 p-3 md:p-6 max-w-4xl w-full">
        <AgentGreeter image="/warren.png" name="Warren" message={message} loading={isLoading} />
        <div className="border border-border rounded-xl p-4 bg-card mb-4">
          <p className="text-foreground/90 text-sm">
            주요 자산 시세와 시장 지표를 실시간으로 추적하고, 관련 뉴스를 확인합니다.
          </p>
        </div>
        <VaultDashboard view={activeTab} />
      </div>
    </div>
  )
}
