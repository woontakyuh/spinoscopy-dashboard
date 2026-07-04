export type OASource = "unpaywall" | "europepmc"
export interface OAResult {
  url: string
  source: OASource
}

export function parseUnpaywall(json: unknown): string | null {
  const j = json as { best_oa_location?: { url_for_pdf?: string | null } | null }
  return j?.best_oa_location?.url_for_pdf ?? null
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

async function tryUnpaywall(doi: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(UNPAYWALL_EMAIL)}`
    )
    if (!res.ok) return null
    return parseUnpaywall(await res.json())
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
  const u = await tryUnpaywall(doi)
  if (u) return { url: u, source: "unpaywall" }
  const e = await tryEuropePmc(doi)
  if (e) return { url: e, source: "europepmc" }
  return null
}
