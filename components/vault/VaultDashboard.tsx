"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { AssetCard } from "./AssetCard"
import { BtcDailyChart } from "./BtcDailyChart"
import type {
  AssetPrice,
  MarketIndicator,
  PricesResponse,
  VaultNewsItem,
  VaultNewsResponse,
} from "@/lib/types/vault"
import { TRACKED_ASSETS } from "@/lib/vault/assets"

type NewsFilter = "all" | string

export function VaultDashboard() {
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

  const prices: AssetPrice[] = pricesQuery.data?.prices ?? []
  const indicators: MarketIndicator[] = pricesQuery.data?.indicators ?? []
  const newsItems: VaultNewsItem[] = newsQuery.data?.items ?? []

  const filteredNews = newsFilter === "all"
    ? newsItems
    : newsItems.filter((item) => item.asset === newsFilter)

  return (
    <div className="space-y-6">
      {indicators.length > 0 && (
        <div className="border border-zinc-700 rounded-xl p-3 bg-zinc-900 space-y-2">
          <p className="text-zinc-400 text-xs font-medium">시장 지표</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2">
            {indicators.map((ind) => {
              const isUp = ind.change !== null && ind.change >= 0
              const isFng = ind.key === "fng"
              const fngColor = isFng
                ? ind.value <= 25 ? "text-red-400" : ind.value <= 45 ? "text-orange-400" : ind.value <= 55 ? "text-yellow-400" : ind.value <= 75 ? "text-green-400" : "text-emerald-400"
                : "text-white"

              return (
                <div key={ind.key} className="flex items-center justify-between gap-1">
                  <span className="text-zinc-400 text-xs truncate">{ind.label}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`text-xs font-medium ${isFng ? fngColor : "text-white"}`}>
                      {ind.key === "btc-dom"
                        ? `${ind.value.toFixed(1)}%`
                        : isFng
                          ? ind.value
                          : ind.value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
                    </span>
                    {isFng && ind.unit && (
                      <span className={`text-[10px] ${fngColor}`}>{ind.unit}</span>
                    )}
                    {ind.change !== null && !isFng && (
                      <span className={`text-[10px] ${isUp ? "text-green-400" : "text-red-400"}`}>
                        {isUp ? "+" : ""}{ind.change.toFixed(2)}%
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <BtcDailyChart />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-zinc-300 text-sm font-medium">보유 자산</p>
          {pricesQuery.data?.fetchedAt && (
            <span className="text-zinc-500 text-xs">
              {new Date(pricesQuery.data.fetchedAt).toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit",
              })} 기준
            </span>
          )}
        </div>

        {pricesQuery.isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={`price-skeleton-${String(i)}`} className="border border-zinc-700 rounded-lg p-3 bg-zinc-800/50 space-y-2">
                <Skeleton className="h-4 w-2/3 bg-zinc-700" />
                <Skeleton className="h-6 w-1/2 bg-zinc-700" />
              </div>
            ))}
          </div>
        ) : pricesQuery.isError ? (
          <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900">
            <p className="text-red-400 text-sm">시세 조회 실패</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 text-xs border-zinc-700 text-zinc-300"
              onClick={() => pricesQuery.refetch()}
            >
              재시도
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {prices.map((asset) => (
              <AssetCard key={asset.symbol} asset={asset} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-zinc-300 text-sm font-medium">관련 뉴스</p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={newsFilter === "all" ? "default" : "outline"}
            size="sm"
            className={`text-xs h-7 ${
              newsFilter === "all"
                ? "bg-cyan-600 hover:bg-cyan-500 text-white"
                : "border-zinc-700 text-zinc-400 hover:text-white"
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
                  : "border-zinc-700 text-zinc-400 hover:text-white"
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
              <div key={`news-skeleton-${String(i)}`} className="border border-zinc-700 rounded-lg p-3 bg-zinc-800/50 space-y-2">
                <Skeleton className="h-4 w-3/4 bg-zinc-700" />
                <Skeleton className="h-3 w-1/3 bg-zinc-700" />
              </div>
            ))}
          </div>
        ) : newsQuery.isError ? (
          <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900">
            <p className="text-red-400 text-sm">뉴스 조회 실패</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 text-xs border-zinc-700 text-zinc-300"
              onClick={() => newsQuery.refetch()}
            >
              재시도
            </Button>
          </div>
        ) : filteredNews.length === 0 ? (
          <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900">
            <p className="text-zinc-500 text-sm">뉴스가 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredNews.map((item) => {
              const asset = TRACKED_ASSETS.find((a) => a.symbol === item.asset)
              return (
                <div key={item.id} className="border border-zinc-700 rounded-lg p-3 bg-zinc-800/50 space-y-1">
                  <div className="flex flex-wrap items-start gap-2">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-white text-sm hover:text-blue-300 transition-colors flex-1 min-w-0"
                    >
                      {item.title}
                    </a>
                    <Badge variant="outline" className="text-[10px] shrink-0 border-zinc-600 text-zinc-300">
                      {asset?.label ?? item.asset}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    {item.date && <span>{item.date}</span>}
                    <span>· {item.source}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
