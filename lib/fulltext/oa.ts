export type OASource = "unpaywall" | "europepmc" | "landing"
export interface OAResult {
  url: string
  source: OASource
}

export function parseUnpaywall(json: unknown): string | null {
  const j = json as {
    best_oa_location?: { url_for_pdf?: string | null } | null
    oa_locations?: Array<{ url_for_pdf?: string | null } | null> | null
  }
  if (j?.best_oa_location?.url_for_pdf) return j.best_oa_location.url_for_pdf
  // best 에 PDF가 없어도 다른 사본(리포지터리 등)에는 있는 경우가 있다.
  for (const loc of j?.oa_locations ?? []) {
    if (loc?.url_for_pdf) return loc.url_for_pdf
  }
  return null
}

/**
 * Unpaywall이 OA라고 판정한 논문의 랜딩페이지 주소.
 * OA가 아니면 null — 유료 논문의 출판사 페이지는 긁지 않는다.
 */
export function unpaywallLandingUrl(json: unknown): string | null {
  const j = json as {
    is_oa?: boolean
    best_oa_location?: { url_for_landing_page?: string | null; url?: string | null } | null
  }
  if (!j?.is_oa) return null
  return j.best_oa_location?.url_for_landing_page ?? j.best_oa_location?.url ?? null
}

/**
 * 출판사 랜딩페이지 HTML의 `citation_pdf_url` meta 태그에서 PDF 주소를 뽑는다.
 * 대부분의 학술 출판사가 이 태그를 심어두므로, Unpaywall이 직접 PDF 링크를
 * 주지 못할 때의 우회로가 된다. 상대경로는 baseUrl 기준으로 절대화한다.
 */
export function extractCitationPdfUrl(html: string, baseUrl: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/name\s*=\s*["']citation_pdf_url["']/i.test(tag)) continue
    const m = tag.match(/content\s*=\s*["']([^"']+)["']/i)
    if (!m) continue
    const raw = m[1].replace(/&amp;/g, "&")
    try {
      return new URL(raw, baseUrl).toString()
    } catch {
      return null
    }
  }
  return null
}

export function parseEuropePmc(json: unknown): string | null {
  const j = json as {
    resultList?: {
      result?: Array<{
        fullTextUrlList?: {
          fullTextUrl?: Array<{ documentStyle?: string; availability?: string; url?: string }>
        }
      }>
    }
  }
  const urls = j?.resultList?.result?.[0]?.fullTextUrlList?.fullTextUrl ?? []
  const hit = urls.find(
    (u) => u.documentStyle === "pdf" && (u.availability ?? "").toLowerCase().includes("open access")
  )
  return hit?.url ?? null
}

const UNPAYWALL_EMAIL = process.env.UNPAYWALL_EMAIL || "woontak.yuh@gmail.com"

// 브라우저가 아니면 막는 출판사가 있어 랜딩페이지 요청엔 일반 UA를 쓴다.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

async function fetchUnpaywall(doi: string): Promise<unknown | null> {
  try {
    const res = await fetch(
      `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(UNPAYWALL_EMAIL)}`
    )
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function tryLandingPage(landingUrl: string): Promise<string | null> {
  try {
    const res = await fetch(landingUrl, { headers: { "User-Agent": BROWSER_UA } })
    if (!res.ok) return null
    return extractCitationPdfUrl(await res.text(), landingUrl)
  } catch {
    return null
  }
}

async function tryEuropePmc(doi: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:%22${encodeURIComponent(
        doi
      )}%22&format=json&resultType=core`
    )
    if (!res.ok) return null
    return parseEuropePmc(await res.json())
  } catch {
    return null
  }
}

export async function resolveOA(doi: string | null, _pmid: string | null): Promise<OAResult | null> {
  if (!doi) return null

  const unpaywall = await fetchUnpaywall(doi)
  const direct = unpaywall ? parseUnpaywall(unpaywall) : null
  if (direct) return { url: direct, source: "unpaywall" }

  const e = await tryEuropePmc(doi)
  if (e) return { url: e, source: "europepmc" }

  // 마지막 수단: OA로 판정됐지만 직접 PDF 링크가 없는 경우(gold OA에 흔하다)
  // 출판사 랜딩페이지의 citation_pdf_url 을 따라간다.
  const landing = unpaywall ? unpaywallLandingUrl(unpaywall) : null
  if (landing) {
    const pdf = await tryLandingPage(landing)
    if (pdf) return { url: pdf, source: "landing" }
  }
  return null
}
