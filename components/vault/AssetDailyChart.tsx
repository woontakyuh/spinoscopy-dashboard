"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts"
import { Skeleton } from "@/components/ui/skeleton"
import type { BtcChartBar, BtcChartPeriod, BtcChartResponse } from "@/lib/types/vault"

import type { ChartInterval } from "@/lib/types/vault"

const PERIODS: { value: BtcChartPeriod; label: string }[] = [
  { value: "1W", label: "wk" },
  { value: "1M", label: "mo" },
  { value: "3M", label: "3mo" },
  { value: "6M", label: "6mo" },
  { value: "1Y", label: "yr" },
]

const INTERVALS: { value: ChartInterval; label: string }[] = [
  { value: "1d", label: "일봉" },
  { value: "1w", label: "주봉" },
  { value: "1mo", label: "월봉" },
]

interface AssetDailyChartProps {
  symbol: string
  title: string
  currency?: "USD" | "KRW" | "POINT"
  height?: number
  defaultPeriod?: BtcChartPeriod
}

function getSourceUrl(symbol: string): string {
  if (symbol === "BTC") return "https://www.coingecko.com/en/coins/bitcoin"
  if (symbol === "ETH") return "https://www.coingecko.com/en/coins/ethereum"
  if (symbol === "NASDAQ") return "https://finance.yahoo.com/quote/%5EIXIC"
  if (symbol === "KOSPI") return "https://finance.yahoo.com/quote/%5EKS11"
  if (/^\d+$/.test(symbol)) return `https://finance.naver.com/item/main.naver?code=${symbol}`
  return `https://www.google.com/finance/quote/${symbol}:NASDAQ`
}

function formatPrice(price: number, currency: string): string {
  if (currency === "POINT") {
    return price.toLocaleString("en-US", { maximumFractionDigits: 2 })
  }
  if (currency === "KRW") {
    return price >= 10000
      ? `${(price / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만원`
      : `${price.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}원`
  }
  return `$${price.toLocaleString("en-US", { maximumFractionDigits: price >= 100 ? 0 : 2 })}`
}

export function AssetDailyChart({
  symbol,
  title,
  currency = "USD",
  height = 320,
  defaultPeriod = "3M",
}: AssetDailyChartProps) {
  const [period, setPeriod] = useState<BtcChartPeriod>(defaultPeriod)
  const [interval, setInterval] = useState<ChartInterval>("1d")
  const containerRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, isError } = useQuery<BtcChartResponse>({
    queryKey: ["vault-asset-chart", symbol, period, interval],
    queryFn: async () => {
      const res = await fetch(`/api/vault/asset-chart?symbol=${symbol}&period=${period}&interval=${interval}`)
      if (!res.ok) throw new Error("차트 조회 실패")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const bars = useMemo(() => {
    if (!data?.bars) return []
    return [...data.bars].sort((a, b) => a.time - b.time)
  }, [data])

  const latestPrice = bars.length > 0 ? bars[bars.length - 1].close : null
  const firstPrice = bars.length > 0 ? bars[0].open : null
  const priceChange =
    latestPrice !== null && firstPrice !== null && firstPrice > 0
      ? ((latestPrice - firstPrice) / firstPrice) * 100
      : null

  useEffect(() => {
    const container = containerRef.current
    if (!container || bars.length === 0) return

    let chart: IChartApi | null = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#a1a1aa",
        fontFamily: "system-ui, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(63, 63, 70, 0.3)" },
        horzLines: { color: "rgba(63, 63, 70, 0.3)" },
      },
      crosshair: {
        vertLine: { color: "rgba(161, 161, 170, 0.3)", labelBackgroundColor: "#27272a" },
        horzLine: { color: "rgba(161, 161, 170, 0.3)", labelBackgroundColor: "#27272a" },
      },
      rightPriceScale: {
        borderColor: "rgba(63, 63, 70, 0.5)",
        scaleMargins: { top: 0.05, bottom: 0.25 },
      },
      leftPriceScale: { visible: false },
      timeScale: {
        borderColor: "rgba(63, 63, 70, 0.5)",
        timeVisible: false,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      borderUpColor: "#26a69a",
      wickUpColor: "#26a69a",
      downColor: "#ef5350",
      borderDownColor: "#ef5350",
      wickDownColor: "#ef5350",
      priceLineVisible: true,
      lastValueVisible: true,
    })

    const candleData: CandlestickData<UTCTimestamp>[] = bars.map((bar) => ({
      time: bar.time as UTCTimestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    }))
    candleSeries.setData(candleData)

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      lastValueVisible: false,
      priceLineVisible: false,
    })

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    })

    const volumeData: HistogramData<UTCTimestamp>[] = bars.map((bar) => ({
      time: bar.time as UTCTimestamp,
      value: bar.volume,
      color: bar.close >= bar.open ? "rgba(38,166,154,0.3)" : "rgba(239,83,80,0.3)",
    }))
    volumeSeries.setData(volumeData)

    chart.timeScale().fitContent()

    let observer: ResizeObserver | null = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry || !chart) return
      chart.applyOptions({ width: entry.contentRect.width })
    })
    observer.observe(container)

    return () => {
      observer?.disconnect()
      observer = null
      chart?.remove()
      chart = null
    }
  }, [bars, height])

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden">
      <div className="p-3 pb-0 space-y-1.5">
        {/* 1줄: 이름(클릭→원본) + 가격 + 변동률 */}
        <div className="flex items-center gap-2 min-w-0">
          <a href={getSourceUrl(symbol)} target="_blank" rel="noreferrer"
            className="text-foreground text-sm font-semibold truncate hover:text-blue-400 transition-colors cursor-pointer">
            {title}
          </a>
          {latestPrice !== null && (
            <span className="text-foreground text-base font-bold shrink-0">
              {formatPrice(latestPrice, currency)}
            </span>
          )}
          {priceChange !== null && (
            <span className={`text-xs font-medium shrink-0 ${priceChange >= 0 ? "text-[#26a69a]" : "text-[#ef5350]"}`}>
              {priceChange >= 0 ? "+" : ""}{priceChange.toFixed(2)}%
            </span>
          )}
        </div>
        {/* 2줄: 봉 타입 + 기간 */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-0.5 border border-border">
            {INTERVALS.map((iv) => (
              <button
                key={iv.value}
                type="button"
                onClick={() => setInterval(iv.value)}
                className={`px-1.5 py-0.5 text-[9px] rounded-md transition-colors ${
                  interval === iv.value
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground/90 hover:bg-muted/60"
                }`}
              >
                {iv.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-0.5 border border-border">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriod(p.value)}
                className={`px-2 py-0.5 text-[10px] rounded-md transition-colors ${
                  period === p.value
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground/90 hover:bg-muted/60"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="p-3">
          <Skeleton className="w-full bg-muted rounded-lg" style={{ height }} />
        </div>
      ) : isError ? (
        <div className="flex items-center justify-center" style={{ height }}>
          <p className="text-red-400 text-sm">차트 데이터 로드 실패</p>
        </div>
      ) : bars.length === 0 ? (
        <div className="flex items-center justify-center" style={{ height }}>
          <p className="text-muted-foreground text-sm">데이터 없음</p>
        </div>
      ) : (
        <div ref={containerRef} className="w-full px-1 pb-1" />
      )}
    </div>
  )
}
