import { NextRequest, NextResponse } from "next/server"
import type { BtcChartBar, BtcChartPeriod, BtcChartResponse } from "@/lib/types/vault"

const PERIOD_LIMITS: Record<BtcChartPeriod, number> = {
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
}

const YAHOO_RANGES: Record<BtcChartPeriod, string> = {
  "1W": "5d",
  "1M": "1mo",
  "3M": "3mo",
  "6M": "6mo",
  "1Y": "1y",
}

const VALID_PERIODS = new Set<string>(Object.keys(PERIOD_LIMITS))

interface AssetConfig {
  source: "binance" | "yahoo"
  ticker: string
}

const ASSET_MAP: Record<string, AssetConfig> = {
  BTC: { source: "binance", ticker: "BTCUSDT" },
  ETH: { source: "binance", ticker: "ETHUSDT" },
  "206650": { source: "yahoo", ticker: "206650.KQ" },
  TSLA: { source: "yahoo", ticker: "TSLA" },
  GOOGL: { source: "yahoo", ticker: "GOOGL" },
  AAPL: { source: "yahoo", ticker: "AAPL" },
}

type BinanceKline = [
  number, string, string, string, string, string,
  number, string, string, string, string, string,
]

interface YahooChartResponse {
  chart: {
    result?: Array<{
      timestamp?: number[]
      indicators?: {
        quote?: Array<{
          open?: (number | null)[]
          high?: (number | null)[]
          low?: (number | null)[]
          close?: (number | null)[]
          volume?: (number | null)[]
        }>
      }
    }>
  }
}

async function fetchBinance(ticker: string, limit: number, interval = "1d"): Promise<BtcChartBar[]> {
  const url = `https://data-api.binance.vision/api/v3/klines?symbol=${ticker}&interval=${interval}&limit=${limit}`
  const res = await fetch(url, { next: { revalidate: 300 } })
  if (!res.ok) return []

  const data = (await res.json()) as BinanceKline[]
  return data.map((k) => ({
    time: Math.floor(k[0] / 1000),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
  }))
}

async function fetchYahoo(ticker: string, range: string, interval = "1d"): Promise<BtcChartBar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${range}`
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SpinoscopyVault/1.0)" },
    next: { revalidate: 300 },
  })
  if (!res.ok) return []

  const data = (await res.json()) as YahooChartResponse
  const result = data.chart?.result?.[0]
  const timestamps = result?.timestamp ?? []
  const quote = result?.indicators?.quote?.[0]
  if (!quote) return []

  const bars: BtcChartBar[] = []
  for (let i = 0; i < timestamps.length; i++) {
    const time = timestamps[i]
    const open = quote.open?.[i]
    const high = quote.high?.[i]
    const low = quote.low?.[i]
    const close = quote.close?.[i]
    const volume = quote.volume?.[i]
    if (time == null || open == null || high == null || low == null || close == null) continue
    bars.push({ time, open, high, low, close, volume: volume ?? 0 })
  }
  return bars
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const symbol = searchParams.get("symbol") ?? "BTC"
    const period = (searchParams.get("period") ?? "3M") as BtcChartPeriod

    if (!VALID_PERIODS.has(period)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 })
    }

    const config = ASSET_MAP[symbol]
    if (!config) {
      return NextResponse.json({ error: `Unknown symbol: ${symbol}` }, { status: 400 })
    }

    const interval = searchParams.get("interval") ?? "1d"
    // Binance intervals: 1d, 1w, 1M; Yahoo intervals: 1d, 1wk, 1mo
    const binanceInterval = interval === "1mo" ? "1M" : interval === "1w" ? "1w" : "1d"
    const yahooInterval = interval === "1w" ? "1wk" : interval === "1mo" ? "1mo" : "1d"

    const bars = config.source === "binance"
      ? await fetchBinance(config.ticker, PERIOD_LIMITS[period], binanceInterval)
      : await fetchYahoo(config.ticker, YAHOO_RANGES[period], yahooInterval)

    if (bars.length === 0) {
      return NextResponse.json({ error: "데이터 조회 실패" }, { status: 502 })
    }

    const response: BtcChartResponse = {
      bars,
      period,
      fetchedAt: new Date().toISOString(),
    }

    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
