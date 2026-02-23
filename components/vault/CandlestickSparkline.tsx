"use client"

import { useEffect, useMemo, useRef } from "react"
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type CandlestickData,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts"
import type { OHLCBar } from "@/lib/types/vault"

interface CandlestickSparklineProps {
  data: OHLCBar[]
  width?: number
  height?: number
}

export function CandlestickSparkline({ data, width, height = 56 }: CandlestickSparklineProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const sortedData = useMemo(
    () => [...data].sort((a, b) => a.time - b.time),
    [data]
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container || sortedData.length === 0) return

    let chart: IChartApi | null = createChart(container, {
      width: width ?? container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "transparent",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: {
        vertLine: { visible: false, labelVisible: false },
        horzLine: { visible: false, labelVisible: false },
      },
      leftPriceScale: { visible: false, borderVisible: false },
      rightPriceScale: { visible: false, borderVisible: false },
      timeScale: {
        visible: false,
        borderVisible: false,
        ticksVisible: false,
      },
      handleScroll: false,
      handleScale: false,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      borderUpColor: "#22c55e",
      wickUpColor: "#22c55e",
      downColor: "#ef4444",
      borderDownColor: "#ef4444",
      wickDownColor: "#ef4444",
      priceLineVisible: false,
      lastValueVisible: false,
    })

    const chartData: CandlestickData<UTCTimestamp>[] = sortedData.map((bar) => ({
      time: bar.time as UTCTimestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    }))
    series.setData(chartData)
    chart.timeScale().fitContent()

    let observer: ResizeObserver | null = null
    if (width == null) {
      observer = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry || !chart) return
        chart.applyOptions({ width: entry.contentRect.width })
      })
      observer.observe(container)
    }

    return () => {
      observer?.disconnect()
      chart?.remove()
      chart = null
    }
  }, [height, sortedData, width])

  return <div ref={containerRef} className="w-full" style={{ height }} />
}
