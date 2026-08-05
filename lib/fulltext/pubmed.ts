// lib/fulltext/pubmed.ts
// DOI 하나로 논문 메타를 PubMed(esearch→esummary)에서 조회.
// CrossRef 에 제목 메타가 없는 논문(중국·일본계 저널에 종종 있다)을 대시보드에서
// DOI 로 추가하면 제목 자리에 DOI 문자열이 박혔고, 야간 doi-backfill 은 Title 을
// 고치지 않아 영구히 남았다. 그 폴백 경로다.

export interface PubmedMeta {
  pmid: string
  title: string
  authors: string
  journal: string
  pubDate: string | null
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
}

/** "2026/07/25 00:00" 또는 "2026 Aug 25" / "2026 Aug" / "2026" → YYYY-MM-DD. 못 읽으면 null. */
function toIsoDate(sortpubdate?: string, pubdate?: string): string | null {
  const slash = sortpubdate?.match(/^(\d{4})\/(\d{2})\/(\d{2})/)
  if (slash) return `${slash[1]}-${slash[2]}-${slash[3]}`

  const m = pubdate?.match(/^(\d{4})(?:\s+([A-Za-z]{3}))?(?:\s+(\d{1,2}))?/)
  if (!m) return null
  const month = m[2] ? (MONTHS[m[2].toLowerCase()] ?? "01") : "01"
  const day = m[3] ? m[3].padStart(2, "0") : "01"
  return `${m[1]}-${month}-${day}`
}

/** esummary 응답 파싱(순수). 제목이 없으면 쓸모없는 메타로 보고 null. */
export function parsePubmedSummary(json: unknown, pmid: string): PubmedMeta | null {
  const rec = (json as { result?: Record<string, unknown> })?.result?.[pmid] as
    | {
        title?: string
        authors?: Array<{ name?: string }>
        fulljournalname?: string
        source?: string
        pubdate?: string
        sortpubdate?: string
      }
    | undefined
  if (!rec) return null

  const title = (rec.title ?? "").trim()
  if (!title) return null

  return {
    pmid,
    title,
    authors: (rec.authors ?? []).map((a) => a.name ?? "").filter(Boolean).join(", "),
    journal: (rec.fulljournalname ?? rec.source ?? "").trim(),
    pubDate: toIsoDate(rec.sortpubdate, rec.pubdate),
  }
}

const UA = "SpinoscopyDashboard/1.0 (mailto:woontak.yuh@gmail.com)"

export async function fetchPubmedMetaByDoi(doi: string): Promise<PubmedMeta | null> {
  try {
    const search = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=1` +
        `&term=${encodeURIComponent(`"${doi}"[AID]`)}`,
      { cache: "no-store", headers: { "User-Agent": UA } }
    )
    if (!search.ok) return null
    const sj = (await search.json()) as { esearchresult?: { idlist?: string[] } }
    const pmid = sj.esearchresult?.idlist?.[0]
    if (!pmid) return null

    const sum = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${pmid}`,
      { cache: "no-store", headers: { "User-Agent": UA } }
    )
    if (!sum.ok) return null
    return parsePubmedSummary(await sum.json(), pmid)
  } catch {
    return null
  }
}
