import { describe, it, expect } from "vitest"
import { isAsideProfileDisconnected } from "./aside"
import {
  extractDoi, safeName, isPdfBuffer, buildFetchScript, parseAsideResult, describeAsideFailure,
  firstAuthorSurname, titleKeyword, doiTail, buildFilename, findDoiInText,
} from "./pdf"

describe("findDoiInText", () => {
  it("bare DOI", () => {
    expect(findDoiInText("10.1007/s00586-026-10116-x")).toBe("10.1007/s00586-026-10116-x")
  })
  it("doi.org 링크", () => {
    expect(findDoiInText("https://doi.org/10.1007/s00586-026-10116-x")).toBe("10.1007/s00586-026-10116-x")
  })
  it("출판사 URL 속 DOI 추출", () => {
    expect(findDoiInText("https://link.springer.com/article/10.1007/s00586-026-10116-x")).toBe(
      "10.1007/s00586-026-10116-x"
    )
  })
  it("쿼리스트링/후행문장부호 제거", () => {
    expect(findDoiInText("see 10.1016/j.spinee.2024.01.001.")).toBe("10.1016/j.spinee.2024.01.001")
    expect(findDoiInText("https://x.org/10.1016/j.spinee.2024.01.001?foo=bar")).toBe(
      "10.1016/j.spinee.2024.01.001"
    )
  })
  it("DOI 없으면 null", () => {
    expect(findDoiInText("그냥 텍스트")).toBeNull()
    expect(findDoiInText("")).toBeNull()
  })
})

describe("firstAuthorSurname", () => {
  it("이니셜.성 형식에서 성을 뽑는다", () => {
    expect(firstAuthorSurname("Y. Yang, X. Yang, Y. Liu")).toBe("Yang")
  })
  it("성 이니셜 형식도 성을 뽑는다", () => {
    expect(firstAuthorSurname("Yang X, Liu Y")).toBe("Yang")
  })
  it("악센트 제거", () => {
    expect(firstAuthorSurname("J. Muñoz")).toBe("Munoz")
  })
  it("빈 값이면 Unknown", () => {
    expect(firstAuthorSurname("")).toBe("Unknown")
  })
})

describe("titleKeyword", () => {
  it("괄호 속 대문자 약어를 우선", () => {
    expect(titleKeyword('A novel strategy of “Separation Surgery” (SSVPI) in managing')).toBe("SSVPI")
  })
  it("약어 없으면 핵심 단어 2개(불용어/일반어 제외)", () => {
    expect(titleKeyword("Reduced paraspinal muscle endurance and electromyography")).toBe("Reduced-Paraspinal")
  })
  it("불용어만 있으면 빈 문자열", () => {
    expect(titleKeyword("A study of the spine surgery")).toBe("")
  })
})

describe("doiTail", () => {
  it("영숫자 마지막 6자", () => {
    expect(doiTail("10.1007/s00586-026-10116-x")).toBe("10116x")
  })
})

describe("buildFilename", () => {
  const base = {
    pubDate: "2026-07-03",
    journal: "ESJ",
    authors: "Y. Yang, X. Yang, Y. Liu",
    title: 'A novel strategy of “Separation Surgery Combined with Vertebroplasty (SSVPI)”',
    doiUrl: "https://doi.org/10.1007/s00586-026-10116-x",
    pageId: "392908af-25b9-8125",
  }
  it("연월_저널_저자_약어", () => {
    expect(buildFilename(base)).toBe("2026_07_ESJ_Yang_SSVPI")
  })
  it("발행일 없으면 0000_00", () => {
    expect(buildFilename({ ...base, pubDate: null })).toBe("0000_00_ESJ_Yang_SSVPI")
  })
  it("키워드 못 뽑으면 DOI 꼬리로 폴백", () => {
    expect(buildFilename({ ...base, title: "A study of the spine" })).toBe("2026_07_ESJ_Yang_10116x")
  })
  it("공백 저널명은 영숫자로 정리", () => {
    expect(buildFilename({ ...base, journal: "JNS Spine" })).toBe("2026_07_JNSSpine_Yang_SSVPI")
  })
})

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

  // 고정 8초 대기로는 Cloudflare 챌린지가 안 끝난 채로 읽는 일이 실측으로 확인됐다
  // (같은 SAGE 페이지가 한 번은 통과, 한 번은 "Just a moment..." 상태에서 실패).
  it("고정 대기 대신 준비될 때까지 폴링한다", () => {
    const s = buildFetchScript("https://doi.org/10.1/x")
    expect(s).toMatch(/just a moment/i)
    expect(s).toMatch(/for\s*\(/)
  })

  it("실패 시 진단정보(최종 URL·제목)를 실어보낸다", () => {
    const s = buildFetchScript("https://doi.org/10.1/x")
    expect(s).toContain("location.href")
    expect(s).toContain("document.title")
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
  it("진단정보를 그대로 통과시킨다", () => {
    const out = 'ASIDE_RESULT {"ok":false,"reason":"no-pdf-url","url":"https://x/a","title":"T"}'
    expect(parseAsideResult(out)).toMatchObject({ ok: false, reason: "no-pdf-url", url: "https://x/a", title: "T" })
  })
})

describe("describeAsideFailure", () => { it("사유에 최종 URL과 페이지 제목을 붙인다 — 원격에서 원인을 보려면 이게 필요하다", () => {
  const s = describeAsideFailure({ ok: false, reason: "no-pdf-url", url: "https://journals.sagepub.com/doi/10.1/x", title: "Some Article" })
  expect(s).toContain("no-pdf-url")
  expect(s).toContain("journals.sagepub.com")
  expect(s).toContain("Some Article")
})
it("진단정보가 없으면 사유만 준다", () => {
  expect(describeAsideFailure({ ok: false, reason: "타임아웃" })).toBe("타임아웃")
})
it("사유조차 없으면 기본 문구", () => {
  expect(describeAsideFailure({ ok: false })).toBe("결과 없음")
}) })

describe("isAsideProfileDisconnected", () => {
  it("classifies the observed disconnected Profile 0 error as retryable infrastructure failure", () => {
    const message = 'Aside Browser profile for account u0 — user@example.com ("Profile 0") is not connected to the daemon.'

    expect(isAsideProfileDisconnected(message)).toBe(true)
  })

  it("does not retry an ordinary publisher PDF lookup failure", () => {
    expect(isAsideProfileDisconnected("no-pdf-url")).toBe(false)
  })
})
