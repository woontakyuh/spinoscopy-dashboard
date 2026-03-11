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

const PERIODS: { value: BtcChartPeriod; label: string }[] = [
  { value: "1W", label: "1주" },
  { value: "1M", label: "1개월" },
  { value: "3M", label: "3개월" },
  { value: "6M", label: "6개월" },
  { value: "1Y", label: "1년" },
]

export function BtcDailyChart() {
  const [period, setPeriod] = useState<BtcChartPeriod>("3M")
  const containerRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, isError } = useQuery<BtcChartResponse>({
    queryKey: ["vault-btc-chart", period],
    queryFn: async () => {
      const res = await fetch(`/api/vault/btc-chart?period=${period}`)
      if (!res.ok) throw new Error("BTC 차트 조회 실패")
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
      height: 320,
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
  }, [bars])

  return (
    <div className="border border-zinc-700 rounded-xl bg-zinc-900 overflow-hidden">
      <div className="flex items-center justify-between p-3 pb-0">
        <div className="flex items-center gap-3">
          <span className="text-white text-sm font-semibold">₿ BTC/USDT 일봉</span>
          {latestPrice !== null && (
            <span className="text-white text-lg font-bold">
              ${latestPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </span>
          )}
          {priceChange !== null && (
            <span className={`text-sm font-medium ${priceChange >= 0 ? "text-[#26a69a]" : "text-[#ef5350]"}`}>
              {priceChange >= 0 ? "+" : ""}{priceChange.toFixed(2)}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 bg-zinc-800/50 rounded-lg p-0.5 border border-zinc-800">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                period === p.value
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="p-3">
          <Skeleton className="h-[320px] w-full bg-zinc-800 rounded-lg" />
        </div>
      ) : isError ? (
        <div className="flex items-center justify-center h-[320px]">
          <p className="text-red-400 text-sm">차트 데이터 로드 실패</p>
        </div>
      ) : bars.length === 0 ? (
        <div className="flex items-center justify-center h-[320px]">
          <p className="text-zinc-500 text-sm">데이터 없음</p>
        </div>
      ) : (
        <div ref={containerRef} className="w-full px-1 pb-1" />
      )}
    </div>
  )
}
