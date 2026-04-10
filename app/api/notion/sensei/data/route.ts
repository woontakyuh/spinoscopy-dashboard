import { NextResponse } from "next/server"
import { fetchSenseiData, type SenseiDataResult } from "@/lib/notion/senseiData"

// 5분 메모리 캐시
let cache: { data: SenseiDataResult; ts: number } | null = null
const TTL = 5 * 60 * 1000

export async function GET() {
  try {
    if (cache && Date.now() - cache.ts < TTL) {
      return NextResponse.json(cache.data, {
        headers: { "X-Cache": "HIT" },
      })
    }

    const data = await fetchSenseiData()
    cache = { data, ts: Date.now() }

    return NextResponse.json(data, {
      headers: { "X-Cache": "MISS" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST() {
  try {
    // 캐시 invalidate + refetch
    const data = await fetchSenseiData()
    cache = { data, ts: Date.now() }
    return NextResponse.json({ ok: true, ...data })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
