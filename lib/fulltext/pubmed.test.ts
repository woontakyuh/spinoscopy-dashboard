import { describe, it, expect } from "vitest"
import { parsePubmedSummary } from "./pubmed"

const PMID = "42544806"

function summary(fields: Record<string, unknown>) {
  return { result: { uids: [PMID], [PMID]: { uid: PMID, ...fields } } }
}

describe("parsePubmedSummary", () => {
  it("제목·저자·저널·발행일을 뽑는다", () => {
    const json = summary({
      title:
        "[Clinical efficacy of Corner approach of unilateral biportal endoscopy in the treatment of low lumbar disc herniation].",
      authors: [{ name: "Wang H" }, { name: "Li J" }, { name: "Zhao Q" }],
      fulljournalname: "Zhongguo gu shang = China journal of orthopaedics and traumatology",
      sortpubdate: "2026/07/25 00:00",
    })
    expect(parsePubmedSummary(json, PMID)).toEqual({
      pmid: PMID,
      title:
        "[Clinical efficacy of Corner approach of unilateral biportal endoscopy in the treatment of low lumbar disc herniation].",
      authors: "Wang H, Li J, Zhao Q",
      journal: "Zhongguo gu shang = China journal of orthopaedics and traumatology",
      pubDate: "2026-07-25",
    })
  })

  it("sortpubdate 가 없으면 pubdate 로 날짜를 만든다", () => {
    const json = summary({ title: "T", pubdate: "2026 Aug" })
    expect(parsePubmedSummary(json, PMID)?.pubDate).toBe("2026-08-01")
  })

  it("연도만 있어도 날짜를 만든다", () => {
    const json = summary({ title: "T", pubdate: "2026" })
    expect(parsePubmedSummary(json, PMID)?.pubDate).toBe("2026-01-01")
  })

  it("날짜를 못 읽으면 null — 잘못된 날짜를 Notion 에 넣지 않는다", () => {
    const json = summary({ title: "T", pubdate: "n/a" })
    expect(parsePubmedSummary(json, PMID)?.pubDate).toBeNull()
  })

  it("저자가 없으면 빈 문자열", () => {
    expect(parsePubmedSummary(summary({ title: "T" }), PMID)?.authors).toBe("")
  })

  it("해당 PMID 결과가 없으면 null", () => {
    expect(parsePubmedSummary({ result: { uids: [] } }, PMID)).toBeNull()
    expect(parsePubmedSummary({}, PMID)).toBeNull()
  })

  it("제목이 비어 있으면 null — 제목 없는 메타는 쓸모가 없다", () => {
    expect(parsePubmedSummary(summary({ title: "" }), PMID)).toBeNull()
  })
})
