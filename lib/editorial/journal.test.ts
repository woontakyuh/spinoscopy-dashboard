import { describe, it, expect } from "vitest"
import { JOURNAL_OPTIONS } from "@/lib/types/editorial"
import { JOURNAL_BADGE } from "@/components/scholar/journalBadge"

describe("JOURNAL_OPTIONS", () => {
  it("Notion Editor-Reviewer DB 의 Journal 옵션과 일치한다", () => {
    expect([...JOURNAL_OPTIONS]).toEqual([
      "Neurospine",
      "JMISST",
      "KJNT",
      "Scientific Reports",
      "PLOS ONE",
      "World Neurosurgery",
      "BMC surgery",
      "BMC Cancer",
      "JSOR",
      "Book Review",
    ])
  })

  it("DB 에 없는 Other 를 포함하지 않는다", () => {
    expect(JOURNAL_OPTIONS).not.toContain("Other")
  })
})

describe("JOURNAL_BADGE", () => {
  it("모든 저널에 배지 색이 있다", () => {
    for (const journal of JOURNAL_OPTIONS) {
      expect(JOURNAL_BADGE[journal], `${journal} 배지 색 없음`).toBeTruthy()
    }
  })
})
