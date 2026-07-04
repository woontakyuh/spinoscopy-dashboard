import { describe, it, expect } from "vitest"
import { extractDoi, safeName, isPdfBuffer, buildFetchScript, parseAsideResult } from "./pdf"

describe("extractDoi", () => {
  it("doi.org URL에서 bare DOI를 뽑는다", () => {
    expect(extractDoi("https://doi.org/10.1007/s00586-024-01234")).toBe("10.1007/s00586-024-01234")
    expect(extractDoi("http://dx.doi.org/10.1016/j.spinee.2024.01.001")).toBe("10.1016/j.spinee.2024.01.001")
  })
  it("이미 bare면 그대로", () => {
    expect(extractDoi("10.1007/xyz")).toBe("10.1007/xyz")
  })
  it("null이면 null", () => {
    expect(extractDoi(null)).toBeNull()
    expect(extractDoi("")).toBeNull()
  })
})

describe("safeName", () => {
  it("DOI의 슬래시/특수문자를 밑줄로", () => {
    expect(safeName("10.1007/s00586-024-01234", "p1")).toBe("10.1007_s00586-024-01234")
  })
  it("DOI 없으면 page id 기반", () => {
    expect(safeName(null, "abc-123")).toBe("page-abc-123")
  })
})

describe("isPdfBuffer", () => {
  it("%PDF로 시작하면 true", () => {
    expect(isPdfBuffer(Buffer.from("%PDF-1.7\n..."))).toBe(true)
  })
  it("아니면 false", () => {
    expect(isPdfBuffer(Buffer.from("<html>login</html>"))).toBe(false)
    expect(isPdfBuffer(Buffer.from(""))).toBe(false)
  })
})

describe("buildFetchScript", () => {
  it("URL을 스크립트에 포함한다", () => {
    const s = buildFetchScript("https://doi.org/10.1/x")
    expect(s).toContain("https://doi.org/10.1/x")
    expect(s).toContain("citation_pdf_url")
    expect(s).toContain("ASIDE_RESULT")
  })
})

describe("parseAsideResult", () => {
  it("ASIDE_RESULT 라인에서 JSON을 파싱한다", () => {
    const out = "noise\nASIDE_RESULT {\"ok\":true,\"b64\":\"QUJD\"}\nmore"
    expect(parseAsideResult(out)).toEqual({ ok: true, b64: "QUJD" })
  })
  it("라인이 없으면 ok:false", () => {
    expect(parseAsideResult("nothing here").ok).toBe(false)
  })
})
