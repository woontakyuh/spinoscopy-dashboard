import { describe, it, expect, vi, afterEach } from "vitest"
import {
  parseUnpaywall,
  parseEuropePmc,
  unpaywallLandingUrl,
  extractCitationPdfUrl,
  resolveOA,
} from "./oa"

describe("parseUnpaywall", () => {
  it("best_oa_location.url_for_pdf 를 뽑는다", () => {
    const json = { best_oa_location: { url_for_pdf: "https://x.org/a.pdf" } }
    expect(parseUnpaywall(json)).toBe("https://x.org/a.pdf")
  })
  it("OA 없으면 null", () => {
    expect(parseUnpaywall({ best_oa_location: null })).toBeNull()
    expect(parseUnpaywall({})).toBeNull()
    expect(parseUnpaywall({ best_oa_location: { url_for_pdf: null } })).toBeNull()
  })
  it("best 에 pdf 가 없으면 다른 oa_locations 에서 찾는다", () => {
    // 실제 사례: gold OA 인데 best_oa_location.url_for_pdf 만 null 인 경우
    const json = {
      best_oa_location: { url_for_pdf: null, url: "https://doi.org/10.1/x" },
      oa_locations: [
        { url_for_pdf: null, url: "https://doi.org/10.1/x" },
        { url_for_pdf: "https://repo.org/b.pdf", url: "https://repo.org/b" },
      ],
    }
    expect(parseUnpaywall(json)).toBe("https://repo.org/b.pdf")
  })
})

describe("unpaywallLandingUrl", () => {
  it("is_oa 일 때 랜딩 URL을 준다 (url_for_landing_page 우선)", () => {
    const json = {
      is_oa: true,
      best_oa_location: { url_for_landing_page: "https://pub.org/article", url: "https://doi.org/10.1/x" },
    }
    expect(unpaywallLandingUrl(json)).toBe("https://pub.org/article")
  })
  it("url_for_landing_page 가 없으면 url 로 대체", () => {
    const json = { is_oa: true, best_oa_location: { url: "https://doi.org/10.1/x" } }
    expect(unpaywallLandingUrl(json)).toBe("https://doi.org/10.1/x")
  })
  it("OA 가 아니면 null — 유료 논문 랜딩페이지를 긁지 않는다", () => {
    expect(unpaywallLandingUrl({ is_oa: false, best_oa_location: { url: "https://x" } })).toBeNull()
    expect(unpaywallLandingUrl({})).toBeNull()
  })
})

describe("extractCitationPdfUrl", () => {
  const base = "https://journals.plos.org/plosone/article?id=10.1371/journal.pone.1"

  it("citation_pdf_url meta 태그에서 PDF 주소를 뽑는다", () => {
    const html = `<meta name="citation_pdf_url" content="https://journals.plos.org/plosone/article/file?id=10.1371/journal.pone.1&type=printable"/>`
    expect(extractCitationPdfUrl(html, base)).toBe(
      "https://journals.plos.org/plosone/article/file?id=10.1371/journal.pone.1&type=printable"
    )
  })
  it("content 가 name 보다 앞서는 순서도 처리한다", () => {
    const html = `<meta content="https://x.org/a.pdf" name="citation_pdf_url">`
    expect(extractCitationPdfUrl(html, base)).toBe("https://x.org/a.pdf")
  })
  it("상대경로는 절대경로로 바꾼다", () => {
    const html = `<meta name="citation_pdf_url" content="/plosone/article/file?type=printable">`
    expect(extractCitationPdfUrl(html, base)).toBe(
      "https://journals.plos.org/plosone/article/file?type=printable"
    )
  })
  it("meta 가 없으면 null", () => {
    expect(extractCitationPdfUrl("<html><body>no meta</body></html>", base)).toBeNull()
  })
})

describe("parseEuropePmc", () => {
  it("Open access pdf fullTextUrl 을 뽑는다", () => {
    const json = {
      resultList: {
        result: [
          {
            fullTextUrlList: {
              fullTextUrl: [
                { documentStyle: "html", availability: "Open access", url: "https://x/html" },
                { documentStyle: "pdf", availability: "Open access", url: "https://x/a.pdf" },
              ],
            },
          },
        ],
      },
    }
    expect(parseEuropePmc(json)).toBe("https://x/a.pdf")
  })
  it("pdf가 없거나 OA 아니면 null", () => {
    expect(parseEuropePmc({ resultList: { result: [] } })).toBeNull()
    expect(
      parseEuropePmc({
        resultList: { result: [{ fullTextUrlList: { fullTextUrl: [{ documentStyle: "pdf", availability: "Subscription required", url: "u" }] } }] },
      })
    ).toBeNull()
  })
})

describe("resolveOA", () => {
  afterEach(() => vi.unstubAllGlobals())

  /** URL 패턴별로 응답을 정해주는 fetch 목. 호출된 URL 목록도 같이 돌려준다. */
  function stubFetch(routes: Array<[RegExp, { json?: unknown; text?: string; ok?: boolean }]>) {
    const calls: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input)
        calls.push(url)
        const hit = routes.find(([re]) => re.test(url))
        if (!hit) return { ok: false, json: async () => ({}), text: async () => "" }
        const [, r] = hit
        return {
          ok: r.ok ?? true,
          json: async () => r.json ?? {},
          text: async () => r.text ?? "",
        }
      })
    )
    return calls
  }

  it("Unpaywall이 직접 PDF 주소를 주면 그것을 쓴다", async () => {
    stubFetch([[/unpaywall/, { json: { is_oa: true, best_oa_location: { url_for_pdf: "https://x.org/a.pdf" } } }]])
    expect(await resolveOA("10.1/x", null)).toEqual({ url: "https://x.org/a.pdf", source: "unpaywall" })
  })

  // 2026-08-05 실측: gold OA인데 url_for_pdf가 null이라 확보에 실패하던 경로.
  it("직접 PDF가 없으면 랜딩페이지의 citation_pdf_url 로 확보한다", async () => {
    stubFetch([
      [
        /unpaywall/,
        {
          json: {
            is_oa: true,
            best_oa_location: { url_for_pdf: null, url_for_landing_page: "https://pub.org/article/1" },
          },
        },
      ],
      [/europepmc/, { json: { resultList: { result: [] } } }],
      [
        /pub\.org\/article\/1$/,
        { text: `<meta name="citation_pdf_url" content="https://pub.org/article/1.pdf">` },
      ],
    ])
    expect(await resolveOA("10.1/x", null)).toEqual({ url: "https://pub.org/article/1.pdf", source: "landing" })
  })

  it("OA가 아니면 랜딩페이지를 아예 긁지 않는다", async () => {
    const calls = stubFetch([
      [/unpaywall/, { json: { is_oa: false, best_oa_location: { url: "https://locked.example/article/1" } } }],
      [/europepmc/, { json: { resultList: { result: [] } } }],
    ])
    expect(await resolveOA("10.1/x", null)).toBeNull()
    expect(calls.some((u) => u.includes("locked.example"))).toBe(false)
  })
})
