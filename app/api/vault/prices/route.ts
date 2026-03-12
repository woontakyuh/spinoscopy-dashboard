import { NextResponse } from "next/server"
import { TRACKED_ASSETS } from "@/lib/vault/assets"
import type { AssetPrice, MarketIndicator, OHLCBar, PricesResponse } from "@/lib/types/vault"

type GeckoOhlcEntry = [number, number, number, number, number]

interface YahooChartResponse {
  chart: {
    result?: Array<{
      meta: {
        symbol: string
        regularMarketPrice: number
        chartPreviousClose: number
        currency: string
      }
      timestamp?: number[]
      indicators?: {
        quote?: Array<{
          open?: (number | null)[]
          high?: (number | null)[]
          low?: (number | null)[]
          close?: (number | null)[]
        }>
      }
    }>
  }
}

type YahooChartResult = NonNullable<YahooChartResponse["chart"]["result"]>[number]

function sortOhlcAscending(data: OHLCBar[]): OHLCBar[] {
  return [...data].sort((a, b) => a.time - b.time)
}

async function fetchCryptoOhlc(geckoId: string): Promise<OHLCBar[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${geckoId}/ohlc?vs_currency=krw&days=30`
  const res = await fetch(url, { next: { revalidate: 120 } })
  if (!res.ok) return []
  const data = (await res.json()) as GeckoOhlcEntry[]

  return sortOhlcAscending(
    data
      .map(([timestampMs, open, high, low, close]) => ({
        time: Math.floor(timestampMs / 1000),
        open,
        high,
        low,
        close,
      }))
      .filter((bar) => Number.isFinite(bar.open) && Number.isFinite(bar.high) && Number.isFinite(bar.low) && Number.isFinite(bar.close))
  )
}

function mapYahooOhlc(result: YahooChartResult | undefined): OHLCBar[] {
  const timestamps = result?.timestamp ?? []
  const quote = result?.indicators?.quote?.[0]
  const opens = quote?.open ?? []
  const highs = quote?.high ?? []
  const lows = quote?.low ?? []
  const closes = quote?.close ?? []

  const bars: OHLCBar[] = []
  for (let i = 0; i < timestamps.length; i += 1) {
    const time = timestamps[i]
    const open = opens[i]
    const high = highs[i]
    const low = lows[i]
    const close = closes[i]

    if (time == null || open == null || high == null || low == null || close == null) continue
    bars.push({ time, open, high, low, close })
  }

  return sortOhlcAscending(bars)
}

async function fetchCryptoPrices(): Promise<AssetPrice[]> {
  const cryptoAssets = TRACKED_ASSETS.filter((a) => a.category === "crypto")
  if (cryptoAssets.length === 0) return []

  const results = await Promise.all(
    cryptoAssets.map(async (asset) => {
      if (!asset.geckoId) return null
      const sparkline = await fetchCryptoOhlc(asset.geckoId)
      if (sparkline.length === 0) return null

      const latestBar = sparkline[sparkline.length - 1]
      const dayAgoBar = sparkline[Math.max(0, sparkline.length - 7)]
      const change24h = dayAgoBar.close > 0 ? ((latestBar.close - dayAgoBar.close) / dayAgoBar.close) * 100 : null

      return {
        symbol: asset.symbol,
        label: asset.label,
        category: asset.category,
        price: latestBar.close,
        change24h,
        currency: "KRW",
        sparkline,
      } satisfies AssetPrice
    })
  )

  return results.filter((r): r is AssetPrice => r !== null)
}

async function fetchStockPrice(yahooTicker: string, range = "5d"): Promise<YahooChartResponse | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&range=${range}`
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SpinoscopyVault/1.0)" },
    next: { revalidate: 300 },
  })
  if (!res.ok) return null
  return (await res.json()) as YahooChartResponse
}

async function fetchStockPrices(): Promise<AssetPrice[]> {
  const stockAssets = TRACKED_ASSETS.filter((a) => a.category !== "crypto")
  if (stockAssets.length === 0) return []
  const results = await Promise.all(
    stockAssets.map(async (asset) => {
      if (!asset.yahooTicker) return null
      const data = await fetchStockPrice(asset.yahooTicker, "1mo")
      const result = data?.chart?.result?.[0]
      const meta = result?.meta
      if (!meta) return null
      const price = meta.regularMarketPrice
      const prevClose = meta.chartPreviousClose
      const change24h = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : null
      const sparkline = mapYahooOhlc(result)
      return {
        symbol: asset.symbol, label: asset.label, category: asset.category,
        price, change24h,
        currency: meta.currency === "KRW" ? "KRW" : "USD",
        sparkline,
      } satisfies AssetPrice
    })
  )
  return results.filter((r): r is AssetPrice => r !== null)
}

interface GeckoGlobalData {
  data: {
    market_cap_percentage: Record<string, number>
  }
}

interface FearGreedResponse {
  data: Array<{
    value: string
    value_classification: string
  }>
}

const INDEX_TICKERS = [
  { ticker: "USDKRW=X", key: "usdkrw", label: "원/달러", unit: "원" },
  { ticker: "^IXIC", key: "nasdaq", label: "NASDAQ", unit: "" },
  { ticker: "^DJI", key: "dow", label: "다우", unit: "" },
  { ticker: "^KS11", key: "kospi", label: "KOSPI", unit: "" },
  { ticker: "^KQ11", key: "kosdaq", label: "KOSDAQ", unit: "" },
]

async function fetchYahooIndicators(): Promise<MarketIndicator[]> {
  const results = await Promise.all(
    INDEX_TICKERS.map(async ({ ticker, key, label, unit }) => {
      const data = await fetchStockPrice(ticker)
      const meta = data?.chart?.result?.[0]?.meta
      if (!meta) return null

      const price = meta.regularMarketPrice
      const prev = meta.chartPreviousClose
      const change = prev > 0 ? ((price - prev) / prev) * 100 : null

      return { key, label, value: price, change, unit } satisfies MarketIndicator
    })
  )
  return results.filter((r): r is MarketIndicator => r !== null)
}

async function fetchBtcDominance(): Promise<MarketIndicator | null> {
  const res = await fetch("https://api.coingecko.com/api/v3/global", {
    next: { revalidate: 300 },
  })
  if (!res.ok) return null
  const data = (await res.json()) as GeckoGlobalData
  const btcDom = data.data?.market_cap_percentage?.btc
  if (btcDom == null) return null
  return { key: "btc-dom", label: "BTC 도미넌스", value: btcDom, change: null, unit: "%" }
}

async function fetchFearGreed(): Promise<MarketIndicator | null> {
  const res = await fetch("https://api.alternative.me/fng/", {
    next: { revalidate: 600 },
  })
  if (!res.ok) return null
  const data = (await res.json()) as FearGreedResponse
  const entry = data.data?.[0]
  if (!entry) return null
  return {
    key: "fng",
    label: "공포탐욕",
    value: Number(entry.value),
    change: null,
    unit: `(${entry.value_classification})`,
  }
}

async function fetchAllIndicators(): Promise<MarketIndicator[]> {
  const [yahooIndicators, btcDom, fng] = await Promise.all([
    fetchYahooIndicators(),
    fetchBtcDominance(),
    fetchFearGreed(),
  ])

  const all = [...yahooIndicators]
  if (btcDom) all.push(btcDom)
  if (fng) all.push(fng)

  const order = ["usdkrw", "fng", "btc-dom", "nasdaq", "dow", "kospi", "kosdaq"]
  const byKey = new Map(all.map((ind) => [ind.key, ind]))
  return order.map((key) => byKey.get(key)).filter((ind): ind is MarketIndicator => ind != null)
}

export async function GET() {
  try {
    const [cryptoPrices, stockPrices, indicators] = await Promise.all([
      fetchCryptoPrices(),
      fetchStockPrices(),
      fetchAllIndicators(),
    ])

    const prices = [...cryptoPrices, ...stockPrices]
    const assetOrder = TRACKED_ASSETS.map((a) => a.symbol)
    prices.sort((a, b) => assetOrder.indexOf(a.symbol) - assetOrder.indexOf(b.symbol))

    const response: PricesResponse = {
      prices,
      indicators,
      fetchedAt: new Date().toISOString(),
    }

    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
