import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("./client", () => ({
  notionRequest: vi.fn(),
  notionEnv: vi.fn(() => "test-journal-db"),
}))

import { readFulltext, addFulltextRequestByDoi, requestFulltext } from "./fulltext"
import { notionRequest } from "./client"

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

describe("addFulltextRequestByDoi — 제목 확보", () => {
  const nr = vi.mocked(notionRequest)
  const fetchMock = vi.fn()

  const DOI = "10.12200/j.issn.1003-0034.20240814"
  const PMID = "42544806"
  const PUBMED_TITLE =
    "[Clinical efficacy of Corner approach of unilateral biportal endoscopy in the treatment of low lumbar disc herniation]."

  beforeEach(() => {
    nr.mockReset()
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    // 1) dedup 조회 → 없음  2) 페이지 생성 → id
    nr.mockResolvedValueOnce({ results: [] } as never)
    nr.mockResolvedValueOnce({ id: "new-page-id" } as never)
  })

  afterEach(() => vi.unstubAllGlobals())

  function routeFetch(crossrefJson: unknown) {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.includes("api.crossref.org")) return { ok: true, json: async () => crossrefJson }
      if (url.includes("esearch.fcgi")) return { ok: true, json: async () => ({ esearchresult: { idlist: [PMID] } }) }
      if (url.includes("esummary.fcgi"))
        return {
          ok: true,
          json: async () => ({
            result: {
              uids: [PMID],
              [PMID]: {
                uid: PMID,
                title: PUBMED_TITLE,
                authors: [{ name: "Wang H" }],
                fulljournalname: "Zhongguo gu shang",
                sortpubdate: "2026/07/25 00:00",
              },
            },
          }),
        }
      return { ok: false, json: async () => ({}) }
    })
  }

  function createdProps(): Record<string, any> {
    const body = nr.mock.calls[1]?.[1]?.body
    if (typeof body !== "string") throw new Error("페이지 생성 호출이 없다")
    return JSON.parse(body).properties
  }

  it("CrossRef 에 제목이 있으면 그대로 쓴다", async () => {
    routeFetch({ message: { title: ["Crossref Title"], "container-title": ["J Test"] } })
    const r = await addFulltextRequestByDoi(DOI)
    expect(r.title).toBe("Crossref Title")
    // 굳이 PubMed 까지 가지 않는다
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("esearch"))).toBe(false)
  })

  // 2026-08-05 실제 사고: CrossRef 에 제목 메타가 없어 DOI 문자열이 제목으로 박혔다.
  it("CrossRef 에 제목이 없으면 PubMed 로 제목을 채운다", async () => {
    routeFetch({ message: { "container-title": ["Zhongguo gu shang"] } })
    const r = await addFulltextRequestByDoi(DOI)
    expect(r.title).toBe(PUBMED_TITLE)
    const props = createdProps()
    expect(props.Title.title[0].text.content).toBe(PUBMED_TITLE)
    expect(props.PMID.rich_text[0].text.content).toBe(PMID)
  })

  it("양쪽 다 실패하면 그때만 DOI 를 제목으로 쓴다", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) })
    const r = await addFulltextRequestByDoi(DOI)
    expect(r.title).toBe(DOI.toLowerCase())
  })
})

describe("requestFulltext — 접근불가 저널 차단", () => {
  const nr = vi.mocked(notionRequest)
  beforeEach(() => nr.mockReset())

  function pageWithJournal(name: string) {
    nr.mockResolvedValueOnce({ properties: { "Journal Name": { type: "select", select: { name } } } } as never)
    nr.mockResolvedValueOnce({} as never)
  }
  function patchBody() {
    return JSON.parse(nr.mock.calls[1][1]!.body as string).properties
  }

  it("접근 가능한 저널은 기존대로 요청됨으로 건다", async () => {
    pageWithJournal("Spine")
    await requestFulltext("page-1")
    const p = patchBody()
    expect(p["원문 요청"].checkbox).toBe(true)
    expect(p["원문 상태"].select.name).toBe("요청됨")
  })

  // TSJ 는 경북대 미구독 — 요청을 걸어봐야 Aside 가 열기만 하고 실패로 쌓인다.
  it("TSJ 는 요청을 걸지 않고 접근불가로 표시한 뒤 알린다", async () => {
    pageWithJournal("TSJ")
    await expect(requestFulltext("page-2")).rejects.toThrow(/구독/)
    const p = patchBody()
    expect(p["원문 요청"].checkbox).toBe(false)
    expect(p["원문 상태"].select.name).toBe("접근불가")
  })

  it("full name 표기(The Spine Journal)도 막는다", async () => {
    pageWithJournal("The Spine Journal")
    await expect(requestFulltext("page-3")).rejects.toThrow()
  })
})
