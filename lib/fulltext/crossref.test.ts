import { describe, it, expect } from "vitest"
import { parseCrossref } from "./crossref"

describe("parseCrossref", () => {
  it("title/author/journal/date를 뽑는다", () => {
    const json = {
      message: {
        title: ["A novel strategy of Separation Surgery (SSVPI)"],
        author: [
          { given: "Y.", family: "Yang" },
          { given: "X.", family: "Liu" },
        ],
        "container-title": ["European Spine Journal"],
        published: { "date-parts": [[2026, 7, 3]] },
      },
    }
    expect(parseCrossref(json)).toEqual({
      title: "A novel strategy of Separation Surgery (SSVPI)",
      authors: "Y. Yang, X. Liu",
      journal: "European Spine Journal",
      pubDate: "2026-07-03",
    })
  })

  it("월/일 없으면 01로 채운다", () => {
    const json = { message: { title: ["T"], "container-title": ["J"], published: { "date-parts": [[2025]] } } }
    expect(parseCrossref(json)?.pubDate).toBe("2025-01-01")
  })

  it("published 없으면 published-print/issued 폴백", () => {
    const json = { message: { title: ["T"], issued: { "date-parts": [[2024, 5]] } } }
    expect(parseCrossref(json)?.pubDate).toBe("2024-05-01")
  })

  it("message 없으면 null", () => {
    expect(parseCrossref({})).toBeNull()
  })

  it("author name 필드도 지원", () => {
    const json = { message: { title: ["T"], author: [{ name: "WHO Collaborators" }] } }
    expect(parseCrossref(json)?.authors).toBe("WHO Collaborators")
  })
})
