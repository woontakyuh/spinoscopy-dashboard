import { describe, it, expect } from "vitest"
import { isAsideProfileDisconnected } from "./aside"
import {
  extractDoi, safeName, isPdfBuffer, buildFetchScript, parseAsideResult, describeAsideFailure,
  firstAuthorSurname, titleKeyword, doiTail, buildFilename, findDoiInText,
  loadPickPdfUrl, countPdfPages, assessFulltext,
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

describe("pickPdfUrl — 어떤 PDF 를 받을지", () => {
  const pick = loadPickPdfUrl()

  // 실측: JNS 6건이 전부 2쪽 미리보기로 저장됐다.
  it("JNS(PubFactory) 미리보기 주소를 본문 다운로드 주소로 바꾼다", () => {
    const base = "https://thejns.org/spine/view/journals/j-neurosurg-spine/aop/article-10.3171-X/article-10.3171-X.xml"
    expect(
      pick({
        base,
        citationPdfUrl: "https://thejns.org/previewpdf/view/journals/j-neurosurg-spine/aop/article-10.3171-X/article-10.3171-X.xml",
      })
    ).toBe("https://thejns.org/downloadpdf/view/journals/j-neurosurg-spine/aop/article-10.3171-X/article-10.3171-X.xml")
  })

  it("일반 출판사는 citation_pdf_url 을 그대로 쓴다", () => {
    expect(
      pick({ base: "https://link.springer.com/article/10.1007/x", citationPdfUrl: "/content/pdf/10.1007/x.pdf" })
    ).toBe("https://link.springer.com/content/pdf/10.1007/x.pdf")
  })

  // 실측: Neurospine 2건이 Supplementary Table(1쪽)로 저장됐다.
  it("Neurospine: journal_download 본문 파일을 보충자료·참고문헌 링크보다 먼저 고른다", () => {
    expect(
      pick({
        base: "https://www.e-neurospine.org/journal/view.php?doi=10.14245/ns.2551862.931",
        citationPdfUrl: null,
        downloadFiles: ["ns-2551862-931.pdf"],
        anchors: [
          { href: "/upload/media/ns-2551862-931-Supplementary-Table-1.pdf" },
          { href: "https://link.springer.com/content/pdf/10.1007/s12178-025-09992-5.pdf", inRefs: true },
        ],
      })
    ).toBe("https://www.e-neurospine.org/upload/pdf/ns-2551862-931.pdf")
  })

  it("앵커만 있을 땐 보충자료·참고문헌·다른 사이트 PDF 를 건너뛴다", () => {
    const base = "https://www.e-neurospine.org/journal/view.php?doi=x"
    expect(
      pick({
        base,
        citationPdfUrl: null,
        anchors: [
          { href: "/upload/media/x-Supplementary-Table-1.pdf" },
          { href: "https://link.springer.com/content/pdf/10.1007/other.pdf" },
          { href: "https://www.nature.com/articles/s41467.pdf", inRefs: true },
        ],
      })
    ).toBeNull()
  })

  it("같은 사이트의 하위 도메인 PDF 는 허용한다", () => {
    expect(
      pick({
        base: "https://journals.lww.com/spinejournal/fulltext/2026/x.aspx",
        citationPdfUrl: null,
        anchors: [{ href: "https://pdfs.journals.lww.com/spinejournal/2026/x.pdf" }],
      })
    ).toBe("https://pdfs.journals.lww.com/spinejournal/2026/x.pdf")
  })

  it("co.kr 같은 2단 국가 도메인은 남의 사이트로 보지 않는다", () => {
    expect(
      pick({
        base: "https://www.foo.co.kr/view?id=1",
        citationPdfUrl: null,
        anchors: [{ href: "https://www.bar.co.kr/x.pdf" }, { href: "https://pdf.foo.co.kr/x.pdf" }],
      })
    ).toBe("https://pdf.foo.co.kr/x.pdf")
  })

  it("fetch 스크립트에 같은 선택 코드가 그대로 들어간다", () => {
    const s = buildFetchScript("https://doi.org/10.1/x")
    expect(s).toContain("function pickPdfUrl(input)")
    expect(s).toContain("/downloadpdf/")
    expect(s).toContain("journal_download")
  })
})

function fakePdf(pages: number): Buffer {
  const objs = Array.from({ length: pages }, (_, i) => `${i + 3} 0 obj << /Type /Page /Parent 2 0 R >> endobj`)
  return Buffer.from(`%PDF-1.4\n2 0 obj << /Type /Pages /Count ${pages} >> endobj\n${objs.join("\n")}\n%%EOF`, "latin1")
}

describe("countPdfPages", () => {
  it("페이지 객체 수를 센다(/Pages 는 제외)", () => {
    expect(countPdfPages(fakePdf(2))).toBe(2)
    expect(countPdfPages(fakePdf(12))).toBe(12)
  })
  it("셀 수 없으면(압축 객체 스트림) null", () => {
    expect(countPdfPages(Buffer.from("%PDF-1.7\n...compressed...", "latin1"))).toBeNull()
  })
})

describe("assessFulltext — 받은 PDF 가 본문인가", () => {
  it("2쪽 이하 원저는 거부(미리보기 추정)", () => {
    const r = assessFulltext(fakePdf(2), { pdfUrl: "https://thejns.org/downloadpdf/x.xml", pubType: "Clinical Study" })
    expect(r.ok).toBe(false)
  })
  it("미리보기 주소면 쪽수와 무관하게 거부", () => {
    expect(assessFulltext(fakePdf(9), { pdfUrl: "https://thejns.org/previewpdf/x.xml" }).ok).toBe(false)
  })
  it("보충자료 주소면 거부", () => {
    expect(
      assessFulltext(fakePdf(4), { pdfUrl: "https://www.e-neurospine.org/upload/media/x-Supplementary-Table-1.pdf" }).ok
    ).toBe(false)
  })
  it("Editorial·Letter 는 짧아도 통과", () => {
    expect(assessFulltext(fakePdf(2), { pubType: "Editorial" }).ok).toBe(true)
    expect(assessFulltext(fakePdf(1), { pubType: "Letter to the Editor" }).ok).toBe(true)
  })
  it("정상 본문은 통과", () => {
    expect(assessFulltext(fakePdf(10), { pdfUrl: "https://link.springer.com/content/pdf/x.pdf" })).toEqual({
      ok: true,
      pages: 10,
    })
  })
  it("쪽수를 못 세면 통과(막을 근거 없음)", () => {
    expect(assessFulltext(Buffer.from("%PDF-1.7\nxx", "latin1"), { pubType: "Clinical Study" }).ok).toBe(true)
  })
})
