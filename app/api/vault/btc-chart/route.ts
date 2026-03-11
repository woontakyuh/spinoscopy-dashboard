import { NextRequest, NextResponse } from "next/server"
import type { BtcChartBar, BtcChartPeriod, BtcChartResponse } from "@/lib/types/vault"

const PERIOD_LIMITS: Record<BtcChartPeriod, number> = {
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
}

const VALID_PERIODS = new Set<string>(Object.keys(PERIOD_LIMITS))

type BinanceKline = [
  number, string, string, string, string, string,
  number, string, string, string, string, string,
]

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const period = (searchParams.get("period") ?? "3M") as BtcChartPeriod

    if (!VALID_PERIODS.has(period)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 })
    }

    const limit = PERIOD_LIMITS[period]
    const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=${limit}`
    const res = await fetch(url, { next: { revalidate: 300 } })

    if (!res.ok) {
      return NextResponse.json({ error: "Binance API 호출 실패" }, { status: 502 })
    }

    const data = (await res.json()) as BinanceKline[]

    const bars: BtcChartBar[] = data.map((k) => ({
      time: Math.floor(k[0] / 1000),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
    }))

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
