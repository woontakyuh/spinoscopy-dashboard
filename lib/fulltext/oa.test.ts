import { describe, it, expect } from "vitest"
import { parseUnpaywall, parseEuropePmc } from "./oa"

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
