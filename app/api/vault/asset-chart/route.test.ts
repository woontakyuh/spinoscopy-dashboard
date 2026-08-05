import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { TRACKED_ASSETS } from "@/lib/vault/assets"
import { GET } from "./route"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("SpaceX Warren market data", () => {
  it("tracks SpaceX as the public Nasdaq SPCX asset", () => {
    expect(TRACKED_ASSETS).toContainEqual({
      symbol: "SPCX",
      label: "SpaceX",
      category: "stock-us",
      yahooTicker: "SPCX",
      newsQuery: "SpaceX SPCX OR 스페이스X",
    })
  })

  it("loads the SPCX daily chart from Yahoo Finance", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      chart: {
        result: [{
          timestamp: [1_785_859_200],
          indicators: {
            quote: [{
              open: [198],
              high: [205],
              low: [196],
              close: [203],
              volume: [12_000_000],
            }],
          },
        }],
      },
    }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const request = new NextRequest(
      "http://localhost/api/vault/asset-chart?symbol=SPCX&period=1M",
    )

    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://query1.finance.yahoo.com/v8/finance/chart/SPCX?interval=1d&range=1mo",
      expect.objectContaining({
        next: { revalidate: 300 },
      }),
    )
    await expect(response.json()).resolves.toMatchObject({
      period: "1M",
      bars: [{
        open: 198,
        high: 205,
        low: 196,
        close: 203,
        volume: 12_000_000,
      }],
    })
  })
})
