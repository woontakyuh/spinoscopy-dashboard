import { NextResponse } from "next/server"
import { TRACKED_ASSETS } from "@/lib/vault/assets"
import type { AssetPrice, MarketIndicator, PricesResponse } from "@/lib/types/vault"

interface GeckoMarketsEntry {
  id: string
  current_price: number
  price_change_percentage_24h: number | null
  sparkline_in_7d?: {
    price: number[]
  }
}

interface YahooChartResponse {
  chart: {
    result?: Array<{
      meta: {
        symbol: string
        regularMarketPrice: number
        chartPreviousClose: number
        currency: string
      }
      indicators?: {
        quote?: Array<{
          close?: (number | null)[]
        }>
      }
    }>
  }
}

async function fetchCryptoPrices(): Promise<AssetPrice[]> {
  const cryptoAssets = TRACKED_ASSETS.filter((a) => a.category === "crypto")
  if (cryptoAssets.length === 0) return []
  const ids = cryptoAssets.map((a) => a.geckoId).join(",")
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=krw&ids=${ids}&sparkline=true&price_change_percentage=24h`
  const res = await fetch(url, { next: { revalidate: 120 } })
  if (!res.ok) return []
  const data = (await res.json()) as GeckoMarketsEntry[]
  return cryptoAssets
    .filter((a) => a.geckoId)
    .map((asset) => {
      const entry = data.find((d) => d.id === asset.geckoId)
      if (!entry) return null
      const fullSparkline = entry.sparkline_in_7d?.price ?? []
      const step = Math.max(1, Math.floor(fullSparkline.length / 24))
      const sparkline = fullSparkline.filter((_, i) => i % step === 0 || i === fullSparkline.length - 1)
      return {
        symbol: asset.symbol, label: asset.label, category: asset.category,
        price: entry.current_price, change24h: entry.price_change_percentage_24h,
        currency: "KRW",
        sparkline,
      }
    })
    .filter((r): r is AssetPrice => r !== null)
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
      const sparkline = result?.indicators?.quote?.[0]?.close?.filter((c): c is number => c !== null) ?? []
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

  const indicators = [...yahooIndicators]
  if (btcDom) indicators.push(btcDom)
  if (fng) indicators.push(fng)
  return indicators
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
