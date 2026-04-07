"use client"

import { useQuery } from "@tanstack/react-query"
import { TopBar } from "@/components/layout/TopBar"
import { AgentGreeter } from "@/components/layout/AgentGreeter"
import { VaultDashboard } from "@/components/vault/VaultDashboard"
import type { PricesResponse, AssetPrice } from "@/lib/types/vault"

export default function VaultPage() {
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

  let message: string
  if (prices.length === 0) {
    message = "시장이 잠잠합니다. 잠시 후 다시 알려드릴게요."
  } else if (top) {
    const sign = (top.change24h ?? 0) >= 0 ? "+" : ""
    message = `오늘 가장 큰 움직임은 ${top.symbol} ${sign}${(top.change24h ?? 0).toFixed(2)}% 입니다. 자세히 보시죠.`
  } else {
    message = `${prices.length}개 자산을 추적 중입니다.`
  }

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="" />
      <div className="p-3 md:p-6 max-w-4xl w-full">
        <AgentGreeter image="/warren.png" name="Warren" message={message} loading={isLoading} />
        <div className="border border-border rounded-xl p-4 bg-card mb-4">
          <p className="text-foreground/90 text-sm">
            주요 자산 시세와 시장 지표를 실시간으로 추적하고, 관련 뉴스를 확인합니다.
          </p>
        </div>
        <VaultDashboard />
      </div>
    </div>
  )
}
