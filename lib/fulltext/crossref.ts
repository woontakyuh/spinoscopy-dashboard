// lib/fulltext/crossref.ts
// DOI 하나로 논문 메타(제목·저자·저널·발행일)를 CrossRef에서 조회.
// 대시보드 수동 원문요청 시 Notion 행을 채우는 용도.

export interface CrossrefMeta {
  title: string
  authors: string
  journal: string
  pubDate: string | null
}

interface CrossrefAuthor {
  given?: string
  family?: string
  name?: string
}

/** CrossRef works 응답 파싱(순수). message.title/author/container-title/published 사용. */
export function parseCrossref(json: unknown): CrossrefMeta | null {
  const m = (json as { message?: Record<string, unknown> })?.message
  if (!m) return null

  const titleArr = m.title as string[] | string | undefined
  const title = (Array.isArray(titleArr) ? titleArr[0] : titleArr) ?? ""

  const authorList = (m.author as CrossrefAuthor[] | undefined) ?? []
  const authors = authorList
    .map((a) => (a.name ? a.name : [a.given, a.family].filter(Boolean).join(" ")))
    .filter(Boolean)
    .join(", ")

  const jArr = m["container-title"] as string[] | string | undefined
  const journal = (Array.isArray(jArr) ? jArr[0] : jArr) ?? ""

  const dateObj =
    (m.published as { "date-parts"?: number[][] } | undefined) ??
    (m["published-print"] as { "date-parts"?: number[][] } | undefined) ??
    (m["published-online"] as { "date-parts"?: number[][] } | undefined) ??
    (m.issued as { "date-parts"?: number[][] } | undefined)
  const parts = dateObj?.["date-parts"]?.[0]
  let pubDate: string | null = null
  if (Array.isArray(parts) && parts[0]) {
    const y = String(parts[0]).padStart(4, "0")
    const mo = String(parts[1] ?? 1).padStart(2, "0")
    const d = String(parts[2] ?? 1).padStart(2, "0")
    pubDate = `${y}-${mo}-${d}`
  }

  return { title: String(title).trim(), authors, journal: String(journal).trim(), pubDate }
}

export async function fetchCrossref(doi: string): Promise<CrossrefMeta | null> {
  try {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { "User-Agent": "SpinoscopyDashboard/1.0 (mailto:woontak.yuh@gmail.com)" },
    })
    if (!res.ok) return null
    return parseCrossref(await res.json())
  } catch {
    return null
  }
}
