export type AssetCategory = "crypto" | "stock-us" | "stock-kr"

export interface TrackedAsset {
  symbol: string
  label: string
  category: AssetCategory
  geckoId?: string
  yahooTicker?: string
  newsQuery: string
}

export interface AssetPrice {
  symbol: string
  label: string
  category: AssetCategory
  price: number
  change24h: number | null
  currency: string
  sparkline: OHLCBar[]
}

export interface OHLCBar {
  time: number
  open: number
  high: number
  low: number
  close: number
}

export interface MarketIndicator {
  key: string
  label: string
  value: number
  change: number | null
  unit: string
}

export interface PricesResponse {
  prices: AssetPrice[]
  indicators: MarketIndicator[]
  fetchedAt: string
}

export type BtcChartPeriod = "1W" | "1M" | "3M" | "6M" | "1Y"

export interface BtcChartBar extends OHLCBar {
  volume: number
}

export interface BtcChartResponse {
  bars: BtcChartBar[]
  period: BtcChartPeriod
  fetchedAt: string
}

export interface VaultNewsItem {
  id: string
  title: string
  url: string
  source: string
  date: string
  asset: string
}

export interface VaultNewsResponse {
  items: VaultNewsItem[]
  fetchedAt: string
}
