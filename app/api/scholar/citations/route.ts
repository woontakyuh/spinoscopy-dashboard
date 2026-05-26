import { NextResponse, type NextRequest } from "next/server"

export const dynamic = "force-dynamic"

// OpenAlex 는 DOI 의 url 접두를 떼고 lowercase 정규화한 값을 키로 씀.
function normalizeDoi(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
}

// OpenAlex /works?filter=doi:X|Y|Z (대시 아니라 파이프).
// 한 번에 최대 100 개 정도 안전. 우리는 30 편 수준이라 단일 호출이면 충분.
async function fetchOpenAlexBatch(dois: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (dois.length === 0) return result

  const filter = `doi:${dois.map((d) => encodeURIComponent(d)).join("|")}`
  const url = `https://api.openalex.org/works?filter=${filter}&per-page=200&select=doi,cited_by_count`

  const res = await fetch(url, {
    headers: {
      "User-Agent": "SpinoscopyDashboard/1.0 (mailto:woontak.yuh@gmail.com)",
    },
    next: { revalidate: 3600 }, // 1 시간 캐시
  })
  if (!res.ok) throw new Error(`OpenAlex ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as { results: Array<{ doi?: string; cited_by_count?: number }> }
  for (const w of data.results) {
    if (!w.doi) continue
    result.set(normalizeDoi(w.doi), w.cited_by_count ?? 0)
  }
  return result
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { dois?: string[] }
    const dois = Array.from(new Set((body.dois ?? []).map(normalizeDoi).filter(Boolean)))
    if (dois.length === 0) {
      return NextResponse.json({ citations: {} })
    }

    // 100 개씩 청크로 (안전 마진)
    const CHUNK = 100
    const citations: Record<string, number> = {}
    for (let i = 0; i < dois.length; i += CHUNK) {
      const chunk = dois.slice(i, i + CHUNK)
      const map = await fetchOpenAlexBatch(chunk)
      for (const [k, v] of map) citations[k] = v
    }

    return NextResponse.json(
      { citations },
      { headers: { "Cache-Control": "private, max-age=3600" } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
