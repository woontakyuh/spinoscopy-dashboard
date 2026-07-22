"use client"

import { useQuery } from "@tanstack/react-query"
import { Skeleton } from "@/components/ui/skeleton"

interface AccountInfo {
  name: string
  number: string
}

interface TossAccountSummary {
  totalAsset: number
  totalPurchase: number
  totalProfit: number
  totalProfitRate: number
  todayProfit: number
  todayProfitRate: number
  currency: string
}

interface AccountResponse {
  configured: boolean
  account: AccountInfo | null
  summary: TossAccountSummary
  fetchedAt: string
}

function formatCurrency(value: number, currency: string): string {
  if (currency === "KRW") {
    if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억원`
    if (value >= 10_000) return `${(value / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만원`
    return `${value.toLocaleString("ko-KR")}원`
  }
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
}

export function PortfolioSummary() {
  const { data, isLoading, isError } = useQuery<AccountResponse>({
    queryKey: ["toss-account"],
    queryFn: async () => {
      const res = await fetch("/api/toss/account")
      if (!res.ok) throw new Error("계좌 조회 실패")
      return res.json()
    },
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
  })

  if (isLoading) {
    return (
      <div className="border border-border rounded-xl p-4 bg-card">
        <Skeleton className="h-6 w-40 bg-muted mb-3" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !data?.configured) {
    return (
      <div className="border border-border rounded-xl p-4 bg-card">
        <p className="text-muted-foreground text-sm">
          {data?.configured === false
            ? "Toss API 연동이 필요합니다."
            : "계좌 정보를 불러올 수 없습니다."}
        </p>
      </div>
    )
  }

  const s = data.summary
  const isTotalUp = s.totalProfit >= 0
  const isTodayUp = s.todayProfit >= 0

  return (
    <div className="border border-border rounded-xl p-4 bg-card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-foreground text-sm font-semibold">
            내 포트폴리오
          </span>
          {data.account && (
            <span className="text-muted-foreground text-xs">
              {data.account.name} ···{data.account.number}
            </span>
          )}
        </div>
        <span className="text-muted-foreground text-[10px]">Toss Securities</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* 총자산 */}
        <div className="bg-muted/50 border border-border rounded-lg px-3 py-2">
          <span className="text-muted-foreground text-[10px] block mb-1">총자산</span>
          <span className="text-foreground text-lg font-bold">
            {formatCurrency(s.totalAsset, s.currency)}
          </span>
        </div>

        {/* 총 평가손익 */}
        <div className="bg-muted/50 border border-border rounded-lg px-3 py-2">
          <span className="text-muted-foreground text-[10px] block mb-1">총 손익</span>
          <span className={`text-lg font-bold ${isTotalUp ? "text-green-400" : "text-red-400"}`}>
            {isTotalUp ? "+" : ""}{formatCurrency(s.totalProfit, s.currency)}
          </span>
          <span className={`text-[10px] ml-1 ${isTotalUp ? "text-green-400" : "text-red-400"}`}>
            ({isTotalUp ? "+" : ""}{s.totalProfitRate.toFixed(2)}%)
          </span>
        </div>

        {/* 오늘 손익 */}
        <div className="bg-muted/50 border border-border rounded-lg px-3 py-2">
          <span className="text-muted-foreground text-[10px] block mb-1">오늘 손익</span>
          <span className={`text-lg font-bold ${isTodayUp ? "text-green-400" : "text-red-400"}`}>
            {isTodayUp ? "+" : ""}{formatCurrency(s.todayProfit, s.currency)}
          </span>
          <span className={`text-[10px] ml-1 ${isTodayUp ? "text-green-400" : "text-red-400"}`}>
            ({isTodayUp ? "+" : ""}{s.todayProfitRate.toFixed(2)}%)
          </span>
        </div>

        {/* 매입금액 */}
        <div className="bg-muted/50 border border-border rounded-lg px-3 py-2">
          <span className="text-muted-foreground text-[10px] block mb-1">매입금액</span>
          <span className="text-foreground text-lg font-bold">
            {formatCurrency(s.totalPurchase, s.currency)}
          </span>
        </div>
      </div>
    </div>
  )
}
