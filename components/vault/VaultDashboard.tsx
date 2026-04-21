"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { AssetDailyChart } from "./AssetDailyChart"
import type {
  MarketIndicator,
  PricesResponse,
  VaultNewsItem,
  VaultNewsResponse,
} from "@/lib/types/vault"
import { TRACKED_ASSETS } from "@/lib/vault/assets"

type NewsFilter = "all" | string

interface VaultDashboardProps {
  view: "charts" | "news"
}

export function VaultDashboard({ view }: VaultDashboardProps) {
  const [newsFilter, setNewsFilter] = useState<NewsFilter>("all")

  const pricesQuery = useQuery({
    queryKey: ["vault-prices"],
    queryFn: async () => {
      const res = await fetch("/api/vault/prices")
      if (!res.ok) throw new Error("시세 조회 실패")
      return res.json() as Promise<PricesResponse>
    },
    refetchInterval: 2 * 60 * 1000,
  })

  const newsQuery = useQuery({
    queryKey: ["vault-news"],
    queryFn: async () => {
      const res = await fetch("/api/vault/news")
      if (!res.ok) throw new Error("뉴스 조회 실패")
      return res.json() as Promise<VaultNewsResponse>
    },
    staleTime: 10 * 60 * 1000,
  })

  const indicators: MarketIndicator[] = pricesQuery.data?.indicators ?? []
  const newsItems: VaultNewsItem[] = newsQuery.data?.items ?? []

  const filteredNews = newsFilter === "all"
    ? newsItems
    : newsItems.filter((item) => item.asset === newsFilter)

  return (
    <div className="space-y-6">
      {/* ─── Charts view ─── */}
      {view === "charts" && (
        <>
          {/* 시장 지표: 1행 원/달러,공포탐욕,BTC도미넌스 | 2행 NASDAQ,DJI,KOSPI,KOSDAQ */}
          {indicators.length > 0 && (() => {
            const ROW1_KEYS = new Set(["usdkrw", "fng", "btc-dom"])
            const row1 = indicators.filter((ind) => ROW1_KEYS.has(ind.key))
            const row2 = indicators.filter((ind) => !ROW1_KEYS.has(ind.key))

            const renderIndicator = (ind: MarketIndicator) => {
              const isUp = ind.change !== null && ind.change >= 0
              const isFng = ind.key === "fng"
              const fngColor = isFng
                ? ind.value <= 25 ? "text-red-400" : ind.value <= 45 ? "text-orange-400" : ind.value <= 55 ? "text-yellow-400" : ind.value <= 75 ? "text-green-400" : "text-emerald-400"
                : "text-foreground"

              return (
                <div key={ind.key} className="bg-muted border border-border rounded-lg px-3 py-2 flex flex-col items-center text-center">
                  <span className="text-muted-foreground text-[10px] mb-1 whitespace-nowrap">{ind.label}</span>
                  <span className={`text-sm font-semibold ${isFng ? fngColor : "text-foreground"}`}>
                    {ind.key === "btc-dom"
                      ? `${ind.value.toFixed(1)}%`
                      : isFng
                        ? ind.value
                        : ind.value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
                  </span>
                  {isFng && ind.unit && (
                    <span className={`text-[10px] mt-0.5 ${fngColor}`}>{ind.unit}</span>
                  )}
                  {ind.change !== null && !isFng && (
                    <span className={`text-[10px] mt-0.5 ${isUp ? "text-green-400" : "text-red-400"}`}>
                      {isUp ? "+" : ""}{ind.change.toFixed(2)}%
                    </span>
                  )}
                </div>
              )
            }

            return (
              <div className="border border-border rounded-xl p-3 bg-card space-y-3">
                <p className="text-muted-foreground text-xs font-medium">시장 지표</p>
                <div className="grid grid-cols-3 gap-2">
                  {row1.map(renderIndicator)}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {row2.map(renderIndicator)}
                </div>
              </div>
            )
          })()}

          {/* BTC 일봉 차트 - 풀 너비 */}
          <AssetDailyChart symbol="BTC" title="₿ BTC/USDT" currency="USD" height={320} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AssetDailyChart symbol="ETH" title="Ξ ETH/USDT" currency="USD" height={240} />
            <AssetDailyChart symbol="206650" title="유바이오로직스" currency="KRW" height={240} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <AssetDailyChart symbol="TSLA" title="TSLA 테슬라" currency="USD" height={240} />
            <AssetDailyChart symbol="GOOGL" title="GOOGL 구글" currency="USD" height={240} />
            <AssetDailyChart symbol="AAPL" title="AAPL 애플" currency="USD" height={240} />
          </div>
        </>
      )}

      {/* ─── News view ─── */}
      {view === "news" && (
      <div className="space-y-3">
        <p className="text-foreground/90 text-sm font-medium">관련 뉴스</p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={newsFilter === "all" ? "default" : "outline"}
            size="sm"
            className={`text-xs h-7 ${
              newsFilter === "all"
                ? "bg-cyan-600 hover:bg-cyan-500 text-white"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setNewsFilter("all")}
          >
            전체
          </Button>
          {TRACKED_ASSETS.map((a) => (
            <Button
              key={a.symbol}
              variant={newsFilter === a.symbol ? "default" : "outline"}
              size="sm"
              className={`text-xs h-7 ${
                newsFilter === a.symbol
                  ? "bg-cyan-600 hover:bg-cyan-500 text-white"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setNewsFilter(a.symbol)}
            >
              {a.label}
            </Button>
          ))}
        </div>

        {newsQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={`news-skeleton-${String(i)}`} className="border border-border rounded-lg p-3 bg-muted/50 space-y-2">
                <Skeleton className="h-4 w-3/4 bg-muted" />
                <Skeleton className="h-3 w-1/3 bg-muted" />
              </div>
            ))}
          </div>
        ) : newsQuery.isError ? (
          <div className="border border-border rounded-xl p-4 bg-card">
            <p className="text-red-400 text-sm">뉴스 조회 실패</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 text-xs border-border text-foreground/90"
              onClick={() => newsQuery.refetch()}
            >
              재시도
            </Button>
          </div>
        ) : filteredNews.length === 0 ? (
          <div className="border border-border rounded-xl p-4 bg-card">
            <p className="text-muted-foreground text-sm">뉴스가 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredNews.map((item) => {
              const asset = TRACKED_ASSETS.find((a) => a.symbol === item.asset)
              return (
                <div key={item.id} className="border border-border rounded-lg p-3 bg-muted/50 space-y-1">
                  <div className="flex flex-wrap items-start gap-2">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-foreground text-sm hover:text-blue-300 transition-colors flex-1 min-w-0"
                    >
                      {item.title}
                    </a>
                    <Badge variant="outline" className="text-[10px] shrink-0 border-border text-foreground/90">
                      {asset?.label ?? item.asset}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {item.date && <span>{item.date}</span>}
                    <span>· {item.source}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      )}
    </div>
  )
}
