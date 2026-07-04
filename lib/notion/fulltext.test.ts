import { describe, it, expect } from "vitest"
import { readFulltext } from "./fulltext"

describe("readFulltext", () => {
  it("모든 필드가 있으면 값을 읽는다", () => {
    const props = {
      "원문 요청": { type: "checkbox", checkbox: true },
      "원문 상태": { type: "select", select: { name: "OA 확보" } },
      "원문 PDF": { type: "url", url: "https://www.dropbox.com/s/abc/x.pdf" },
    }
    expect(readFulltext(props)).toEqual({
      requested: true,
      status: "OA 확보",
      pdf: "https://www.dropbox.com/s/abc/x.pdf",
    })
  })

  it("필드가 비어있으면 기본값을 준다", () => {
    expect(readFulltext({})).toEqual({ requested: false, status: null, pdf: null })
  })

  it("select/url이 null이면 null", () => {
    const props = {
      "원문 요청": { type: "checkbox", checkbox: false },
      "원문 상태": { type: "select", select: null },
      "원문 PDF": { type: "url", url: null },
    }
    expect(readFulltext(props)).toEqual({ requested: false, status: null, pdf: null })
  })
})
