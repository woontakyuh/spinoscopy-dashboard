"use client"

import { useQuery } from "@tanstack/react-query"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"

interface TossHolding {
  symbol: string
  name: string
  quantity: number
  averagePrice: number
  currentPrice: number
  totalValue: number
  profit: number
  profitRate: number
  currency: string
  market: "KR" | "US"
}

interface HoldingsResponse {
  configured: boolean
  holdings: TossHolding[]
  fetchedAt: string
}

function formatPrice(price: number, currency: string): string {
  if (currency === "KRW") {
    if (price >= 10_000) return `${(price / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만원`
    return `${price.toLocaleString("ko-KR")}원`
  }
  return `$${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
}

export function HoldingsTable() {
  const { data, isLoading, isError } = useQuery<HoldingsResponse>({
    queryKey: ["toss-holdings"],
    queryFn: async () => {
      const res = await fetch("/api/toss/holdings")
      if (!res.ok) throw new Error("보유 주식 조회 실패")
      return res.json()
    },
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
  })

  if (isLoading) {
    return (
      <div className="border border-border rounded-xl p-4 bg-card">
        <Skeleton className="h-5 w-32 bg-muted mb-3" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !data?.configured) {
    return null
  }

  const holdings = data.holdings

  if (holdings.length === 0) {
    return (
      <div className="border border-border rounded-xl p-4 bg-card">
        <p className="text-muted-foreground text-sm">보유 종목이 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="border border-border rounded-xl p-4 bg-card space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-medium">보유 주식</p>
        <span className="text-[11px] text-muted-foreground">{holdings.length}종목</span>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-[10px] border-b border-border">
              <th className="text-left py-1.5 px-2 font-normal">종목</th>
              <th className="text-right py-1.5 px-2 font-normal">수량</th>
              <th className="text-right py-1.5 px-2 font-normal">평단가</th>
              <th className="text-right py-1.5 px-2 font-normal">현재가</th>
              <th className="text-right py-1.5 px-2 font-normal">평가금액</th>
              <th className="text-right py-1.5 px-2 font-normal">손익</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const isUp = h.profit >= 0
              return (
                <tr key={h.symbol} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground font-medium">{h.name}</span>
                      <Badge variant="outline" className="text-[9px] border-border text-muted-foreground">
                        {h.symbol}
                      </Badge>
                      {h.market === "US" && (
                        <Badge variant="outline" className="text-[9px] border-blue-500/30 text-blue-300">US</Badge>
                      )}
                    </div>
                  </td>
                  <td className="text-right py-2 px-2 text-foreground/90">{h.quantity.toLocaleString()}</td>
                  <td className="text-right py-2 px-2 text-muted-foreground">{formatPrice(h.averagePrice, h.currency)}</td>
                  <td className="text-right py-2 px-2 text-foreground/90">{formatPrice(h.currentPrice, h.currency)}</td>
                  <td className="text-right py-2 px-2 text-foreground font-medium">{formatPrice(h.totalValue, h.currency)}</td>
                  <td className={`text-right py-2 px-2 font-medium ${isUp ? "text-green-400" : "text-red-400"}`}>
                    {isUp ? "+" : ""}{formatPrice(h.profit, h.currency)}
                    <span className="text-[10px] block">
                      ({isUp ? "+" : ""}{h.profitRate.toFixed(2)}%)
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {holdings.map((h) => {
          const isUp = h.profit >= 0
          return (
            <div key={h.symbol} className="border border-border rounded-lg p-3 bg-muted/50">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-foreground text-sm font-medium">{h.name}</span>
                  <Badge variant="outline" className="text-[9px] border-border text-muted-foreground">{h.symbol}</Badge>
                </div>
                <span className={`text-sm font-medium ${isUp ? "text-green-400" : "text-red-400"}`}>
                  {isUp ? "+" : ""}{h.profitRate.toFixed(2)}%
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{h.quantity.toLocaleString()}주 · {formatPrice(h.averagePrice, h.currency)}</span>
                <span className="text-foreground/90">{formatPrice(h.totalValue, h.currency)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
